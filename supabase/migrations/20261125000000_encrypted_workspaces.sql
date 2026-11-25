-- Canvas Studio v2: encrypted workspaces in the cloud (ADR 0012).
--
-- The server only ever stores ciphertext. Designs and images are sealed in
-- the browser with each account's AES-256-GCM data key; the key itself is
-- stored here only wrapped (by a key derived from the password, and by one
-- derived from the recovery code), so roaming between devices works
-- without the server being able to read anything.
--
-- - workspace_keys: one row per user, the two wraps, version-checked.
-- - workspace_designs: sealed documents, version-checked, tombstoned,
--   realtime. Ciphertext is cleared when a design is deleted.
-- - workspace-assets bucket: sealed images under "<user id>/<asset id>".
-- - workspace_shares + workspace-shares bucket: view-only share links. A
--   share is a deliberate publish of a title and PNG (ADR 0008 semantics).
-- - delete_my_account(): also waits for workspace share images.
--
-- Expand-only: v1's designs/design_shares tables and buckets are untouched,
-- so the v1 app keeps working until v2 is live. Dropping them is a later
-- contract migration.
-- Rollback: supabase/rollback/20261125000000_encrypted_workspaces_down.sql

-- ---------------------------------------------------------------------------
-- Wrapped workspace keys
-- ---------------------------------------------------------------------------
create table public.workspace_keys (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  -- {salt, iterations, iv, wrapped}: base64 fields, validated by clients.
  password_wrap jsonb not null
    check (jsonb_typeof(password_wrap) = 'object'
           and pg_column_size(password_wrap) <= 4096),
  recovery_wrap jsonb
    check (recovery_wrap is null
           or (jsonb_typeof(recovery_wrap) = 'object'
               and pg_column_size(recovery_wrap) <= 4096)),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspace_keys is
  'Each user''s workspace data key, wrapped by password- and recovery-derived keys. Never plaintext.';

create function public.workspace_keys_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.version := 1;
    new.created_at := now();
  else
    if new.version <> old.version + 1 then
      raise exception 'version must increase by exactly 1 (expected %, got %)',
        old.version + 1, new.version
        using errcode = '40001';
    end if;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_keys_before_write
  before insert or update on public.workspace_keys
  for each row execute function public.workspace_keys_before_write();

alter table public.workspace_keys enable row level security;
revoke all on public.workspace_keys from anon;
grant select, insert, update on public.workspace_keys to authenticated;

create policy workspace_keys_select_own on public.workspace_keys
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy workspace_keys_insert_own on public.workspace_keys
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy workspace_keys_update_own on public.workspace_keys
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: the row goes with the account (on delete cascade).

-- ---------------------------------------------------------------------------
-- Sealed designs
-- ---------------------------------------------------------------------------
create table public.workspace_designs (
  id uuid primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- AES-GCM ciphertext and 96-bit IV, base64. Null once deleted.
  ciphertext text
    check (ciphertext is null or char_length(ciphertext) <= 7000000),
  iv text
    check (iv is null or char_length(iv) = 16),
  version integer not null default 1 check (version >= 1),
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Live rows carry ciphertext; tombstones carry none.
  constraint workspace_designs_payload_check check (
    (deleted_at is null and ciphertext is not null and iv is not null)
    or (deleted_at is not null and ciphertext is null and iv is null)
  )
);

comment on table public.workspace_designs is
  'One row per design, sealed client-side. Tombstoned via deleted_at so other devices learn about deletions.';

create index workspace_designs_user_sync_idx
  on public.workspace_designs (user_id, updated_at, id);

create function public.workspace_designs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.version := 1;
    new.created_at := now();
  else
    if new.version <> old.version + 1 then
      raise exception 'version must increase by exactly 1 (expected %, got %)',
        old.version + 1, new.version
        using errcode = '40001';
    end if;
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger workspace_designs_before_write
  before insert or update on public.workspace_designs
  for each row execute function public.workspace_designs_before_write();

alter table public.workspace_designs enable row level security;
revoke all on public.workspace_designs from anon;
grant select, insert, update on public.workspace_designs to authenticated;

create policy workspace_designs_select_own on public.workspace_designs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy workspace_designs_insert_own on public.workspace_designs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy workspace_designs_update_own on public.workspace_designs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.workspace_designs;

-- ---------------------------------------------------------------------------
-- Sealed images: private bucket, "<user id>/<asset id>".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-assets',
  'workspace-assets',
  false,
  -- 15 MB images, sealed and base64-encoded in a JSON envelope.
  23068672,
  array['application/json']
)
on conflict (id) do nothing;

create policy workspace_assets_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy workspace_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy workspace_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Share links (published PNG + title; everything else stays sealed)
-- ---------------------------------------------------------------------------
create table public.workspace_shares (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null unique
    references public.workspace_designs (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  width integer not null check (width between 16 and 8000),
  height integer not null check (height between 16 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspace_shares is
  'Public view links for v2 designs. The id is the unguessable token; see get_workspace_share().';

create index workspace_shares_user_idx on public.workspace_shares (user_id);

create function public.workspace_shares_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.created_at := now();
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.design_id := old.design_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_shares_before_write
  before insert or update on public.workspace_shares
  for each row execute function public.workspace_shares_before_write();

alter table public.workspace_shares enable row level security;
revoke all on public.workspace_shares from anon;
grant select, insert, update, delete on public.workspace_shares to authenticated;

create policy workspace_shares_select_own on public.workspace_shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only for a live design the caller owns (designs RLS applies in the subquery).
create policy workspace_shares_insert_own on public.workspace_shares
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.workspace_designs d
      where d.id = design_id and d.deleted_at is null
    )
  );

create policy workspace_shares_update_own on public.workspace_shares
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workspace_shares_delete_own on public.workspace_shares
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.get_workspace_share(share_id uuid)
returns table (
  id uuid,
  title text,
  width integer,
  height integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.width, s.height, s.updated_at
  from public.workspace_shares s
  join public.workspace_designs d on d.id = s.design_id
  where s.id = share_id
    and d.deleted_at is null;
$$;

revoke all on function public.get_workspace_share(uuid) from public;
grant execute on function public.get_workspace_share(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-shares', 'workspace-shares', true, 15728640, array['image/png'])
on conflict (id) do nothing;

create policy workspace_shares_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid()) and name = s.id::text || '.png'
    )
  );

-- ---------------------------------------------------------------------------
-- Account deletion waits for every share image (v1 and v2) as well as the
-- user's folders, so no personal file outlives the account.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (
    select 1
    from storage.objects o
    where (storage.foldername(o.name))[1] = caller::text
       or (
         o.bucket_id = 'design-shares'
         and exists (
           select 1 from public.design_shares s
           where s.user_id = caller and o.name = s.id::text || '.png'
         )
       )
       or (
         o.bucket_id = 'workspace-shares'
         and exists (
           select 1 from public.workspace_shares s
           where s.user_id = caller and o.name = s.id::text || '.png'
         )
       )
  ) then
    raise exception 'delete your files before deleting the account'
      using errcode = 'P0001', hint = 'storage_not_empty';
  end if;

  delete from auth.users where id = caller;
end;
$$;
