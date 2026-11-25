-- Reverts 20261125000000_encrypted_workspaces.sql.
-- DESTRUCTIVE: deletes every v2 cloud design, wrapped key and share link.
-- Devices keep their local encrypted copies, but a device that never had
-- a design loses it. Empty the workspace-assets and workspace-shares
-- buckets (Storage API or dashboard) first, because storage.objects rows
-- can't be deleted with SQL on Supabase.

-- Restore the previous delete_my_account() (user folders + v1 shares).
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
  ) then
    raise exception 'delete your files before deleting the account'
      using errcode = 'P0001', hint = 'storage_not_empty';
  end if;
  delete from auth.users where id = caller;
end;
$$;

drop policy if exists workspace_shares_objects_delete_own on storage.objects;
drop policy if exists workspace_shares_objects_update_own on storage.objects;
drop policy if exists workspace_shares_objects_insert_own on storage.objects;
drop policy if exists workspace_shares_objects_select_own on storage.objects;
delete from storage.buckets where id = 'workspace-shares';
drop function if exists public.get_workspace_share(uuid);
drop table if exists public.workspace_shares;
drop function if exists public.workspace_shares_before_write();

drop policy if exists workspace_assets_delete_own on storage.objects;
drop policy if exists workspace_assets_insert_own on storage.objects;
drop policy if exists workspace_assets_select_own on storage.objects;
delete from storage.buckets where id = 'workspace-assets';

alter publication supabase_realtime drop table public.workspace_designs;
drop table if exists public.workspace_designs;
drop function if exists public.workspace_designs_before_write();

drop table if exists public.workspace_keys;
drop function if exists public.workspace_keys_before_write();
