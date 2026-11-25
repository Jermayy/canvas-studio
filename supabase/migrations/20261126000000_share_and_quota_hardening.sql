-- Hardening from the PR #15 security review (ADR 0012).
--
-- 1. Share images are no longer public objects. The workspace-shares bucket
--    becomes private; anyone may read "<share id>.png" only while its share
--    row exists and its design isn't deleted. The public page asks for a
--    short-lived signed URL, so deleting a design (even offline, from any
--    device) or stopping sharing cuts access immediately.
-- 2. A share row can't be deleted while its image exists, so an image can
--    never be orphaned (unreadable, undeletable, and invisible to
--    delete_my_account()).
-- 3. Per-user quotas: at most 5,000 designs and 5,000 stored images, so an
--    account can't be used as free unlimited storage.
-- 4. Storage policies qualify `objects.name`, so a future `name` column on
--    workspace_shares can't silently change what they match.
--
-- Backward compatible with the deployed apps: v1 doesn't use these objects;
-- the hybrid's owner paths (upload, unpublish) keep working, and its public
-- page switches to signed URLs in the same release.
-- Rollback: supabase/rollback/20261126000000_share_and_quota_hardening_down.sql

-- ---------------------------------------------------------------------------
-- 1. Private share images, readable while the link is live
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id = 'workspace-shares';

-- Bypasses RLS on purpose (policies on storage.objects can't query it
-- themselves without recursion); answers only "is this share image live?".
create function public.workspace_share_image_is_live(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_shares s
    join public.workspace_designs d on d.id = s.design_id
    where object_name = s.id::text || '.png'
      and d.deleted_at is null
  );
$$;

revoke all on function public.workspace_share_image_is_live(text) from public;
grant execute on function public.workspace_share_image_is_live(text)
  to anon, authenticated;

create policy workspace_shares_objects_read_live on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'workspace-shares'
    and public.workspace_share_image_is_live(objects.name)
  );

-- ---------------------------------------------------------------------------
-- 4. Re-create the owner policies with a qualified column name.
-- ---------------------------------------------------------------------------
drop policy workspace_shares_objects_select_own on storage.objects;
drop policy workspace_shares_objects_insert_own on storage.objects;
drop policy workspace_shares_objects_update_own on storage.objects;
drop policy workspace_shares_objects_delete_own on storage.objects;

create policy workspace_shares_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid())
        and objects.name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid())
        and objects.name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid())
        and objects.name = s.id::text || '.png'
    )
  );

create policy workspace_shares_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-shares'
    and exists (
      select 1 from public.workspace_shares s
      where s.user_id = (select auth.uid())
        and objects.name = s.id::text || '.png'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. No orphaned share images
-- ---------------------------------------------------------------------------
create function public.workspace_shares_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'workspace-shares'
      and o.name = old.id::text || '.png'
  ) then
    raise exception 'delete the share image before the share'
      using errcode = 'P0001', hint = 'share_image_exists';
  end if;
  return old;
end;
$$;

create trigger workspace_shares_before_delete
  before delete on public.workspace_shares
  for each row execute function public.workspace_shares_before_delete();

-- ---------------------------------------------------------------------------
-- 3. Quotas
-- ---------------------------------------------------------------------------
create function public.workspace_designs_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.workspace_designs where user_id = new.user_id)
     >= 5000 then
    raise exception 'design limit reached'
      using errcode = 'P0001', hint = 'quota_designs';
  end if;
  return new;
end;
$$;

-- Runs after workspace_designs_before_write (alphabetical), so user_id is set.
create trigger workspace_designs_quota
  before insert on public.workspace_designs
  for each row execute function public.workspace_designs_quota();

create function public.workspace_asset_count(owner uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from storage.objects o
  where o.bucket_id = 'workspace-assets'
    and (storage.foldername(o.name))[1] = owner::text;
$$;

revoke all on function public.workspace_asset_count(uuid) from public;
grant execute on function public.workspace_asset_count(uuid) to authenticated;

drop policy workspace_assets_insert_own on storage.objects;
create policy workspace_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
    and public.workspace_asset_count((select auth.uid())) < 5000
  );
