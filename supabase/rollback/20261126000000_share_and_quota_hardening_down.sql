-- Reverts 20261126000000_share_and_quota_hardening.sql.
-- Not destructive to data. Share images become public objects again
-- (readable by URL even after a design is deleted), so roll the app back
-- to a version that uses public image URLs at the same time.

drop policy if exists workspace_assets_insert_own on storage.objects;
create policy workspace_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop function if exists public.workspace_asset_count(uuid);

drop trigger if exists workspace_designs_quota on public.workspace_designs;
drop function if exists public.workspace_designs_quota();

drop trigger if exists workspace_shares_before_delete on public.workspace_shares;
drop function if exists public.workspace_shares_before_delete();

-- The owner policies stay (qualified names behave identically).
drop policy if exists workspace_shares_objects_read_live on storage.objects;
drop function if exists public.workspace_share_image_is_live(text);
update storage.buckets set public = true where id = 'workspace-shares';
