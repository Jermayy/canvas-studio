-- Share images readable only while live, no orphaned images, quotas.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');

select pg_temp.assert(
  (select not public from storage.buckets where id = 'workspace-shares'),
  'share images are not public objects'
);

select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workspace_designs (id, ciphertext, iv, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000a', 'c2VhbGVk', 'AAAAAAAAAAAAAAAA', now());
insert into public.workspace_shares (id, design_id, title, width, height)
values ('5aaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-00000000000a', 'A poster', 1080, 1350);
insert into storage.objects (bucket_id, name)
values ('workspace-shares', '5aaaaaaa-0000-0000-0000-000000000001.png');
reset role;

-- Anyone can read a live share's image, and only that object.
set role anon;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'workspace-shares') = 1,
  'anyone can read the image of a live share'
);
reset role;

-- An image can't be orphaned by deleting its share first.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  delete from public.workspace_shares
  where id = '5aaaaaaa-0000-0000-0000-000000000001';
  raise exception 'FAIL: deleted a share while its image exists';
exception when sqlstate 'P0001' then
  raise notice 'PASS: a share keeps its row until its image is gone';
end $$;

-- Deleting the design (a tombstone) cuts public access at once.
update public.workspace_designs
set deleted_at = now(), ciphertext = null, iv = null, version = 2
where id = 'dddddddd-0000-0000-0000-00000000000a';
reset role;
set role anon;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'workspace-shares') = 0,
  'a deleted design''s share image is no longer readable'
);
reset role;

-- The owner can still clean up: image first, then the share.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from storage.objects
where name = '5aaaaaaa-0000-0000-0000-000000000001.png';
delete from public.workspace_shares
where id = '5aaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert(
  not exists (select 1 from public.workspace_shares),
  'owners can remove the image and then the share'
);

-- Quotas: 5,000 designs and 5,000 images per user.
select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.workspace_designs (id, ciphertext, iv, client_updated_at)
select gen_random_uuid(), 'eA==', 'AAAAAAAAAAAAAAAA', now()
from generate_series(1, 5000);
do $$ begin
  insert into public.workspace_designs (id, ciphertext, iv, client_updated_at)
  values (gen_random_uuid(), 'eA==', 'AAAAAAAAAAAAAAAA', now());
  raise exception 'FAIL: stored a design over the quota';
exception when sqlstate 'P0001' then
  raise notice 'PASS: designs are limited per user';
end $$;
insert into storage.objects (bucket_id, name)
select 'workspace-assets', 'bbbbbbbb-0000-0000-0000-000000000002/img-' || n
from generate_series(1, 5000) as n;
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('workspace-assets', 'bbbbbbbb-0000-0000-0000-000000000002/one-more');
  raise exception 'FAIL: stored an image over the quota';
exception when insufficient_privilege then
  raise notice 'PASS: images are limited per user';
end $$;
reset role;

-- The other user is unaffected by B's quota.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name)
values ('workspace-assets', 'aaaaaaaa-0000-0000-0000-000000000001/img-1');
reset role;
select pg_temp.assert(
  (select count(*) from storage.objects
   where name like 'aaaaaaaa-0000-0000-0000-000000000001/%') = 1,
  'quotas are per user'
);
