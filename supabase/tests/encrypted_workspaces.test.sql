-- Encrypted workspaces: owner-only keys and designs, server-owned
-- versions, ciphertext cleared on delete, share links, account deletion.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');

-- Keys: a forged owner is replaced with the caller; versions are enforced.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workspace_keys (user_id, password_wrap, version)
values ('bbbbbbbb-0000-0000-0000-000000000002', '{"wrapped":"a1"}', 7);
reset role;
select pg_temp.assert(
  (select user_id::text || version from public.workspace_keys)
    = 'aaaaaaaa-0000-0000-0000-0000000000011',
  'a key row always belongs to the caller and starts at version 1'
);
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  update public.workspace_keys set password_wrap = '{"wrapped":"a2"}', version = 3;
  raise exception 'FAIL: skipped a key version';
exception when sqlstate '40001' then
  raise notice 'PASS: key updates must increase the version by one';
end $$;
update public.workspace_keys
set password_wrap = '{"wrapped":"a2"}', version = 2
where version = 1;
-- A stale writer matches no row instead of overwriting the newer wrap.
update public.workspace_keys
set password_wrap = '{"wrapped":"stale"}', version = 2
where version = 1;
reset role;
select pg_temp.assert(
  (select password_wrap ->> 'wrapped' from public.workspace_keys) = 'a2',
  'a stale key update changes nothing'
);

-- Another user can't read or replace A's key.
select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.assert(
  (select count(*) from public.workspace_keys) = 0,
  'other users cannot read a wrapped key'
);
update public.workspace_keys set password_wrap = '{"wrapped":"evil"}', version = 3;
reset role;
select pg_temp.assert(
  (select password_wrap ->> 'wrapped' from public.workspace_keys) = 'a2',
  'other users cannot replace a wrapped key'
);
set role anon;
do $$ begin
  perform count(*) from public.workspace_keys;
  raise exception 'FAIL: anon can read keys';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot read keys';
end $$;
reset role;

-- Designs: live rows need ciphertext; tombstones must drop it.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workspace_designs (id, ciphertext, iv, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000a', 'c2VhbGVk', 'AAAAAAAAAAAAAAAA', now());
do $$ begin
  insert into public.workspace_designs (id, client_updated_at)
  values ('dddddddd-0000-0000-0000-00000000000c', now());
  raise exception 'FAIL: stored a live design without ciphertext';
exception when check_violation then
  raise notice 'PASS: live designs must carry ciphertext';
end $$;
do $$ begin
  update public.workspace_designs
  set deleted_at = now(), version = 2
  where id = 'dddddddd-0000-0000-0000-00000000000a';
  raise exception 'FAIL: kept ciphertext on a tombstone';
exception when check_violation then
  raise notice 'PASS: tombstones must not keep ciphertext';
end $$;
reset role;

-- Designs: the server owns version and owner, and enforces +1 updates.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workspace_designs
  (id, user_id, ciphertext, iv, version, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000f',
        'bbbbbbbb-0000-0000-0000-000000000002',
        'Zg==', 'CCCCCCCCCCCCCCCC', 9, now());
reset role;
select pg_temp.assert(
  (select user_id::text || version from public.workspace_designs
   where id = 'dddddddd-0000-0000-0000-00000000000f')
    = 'aaaaaaaa-0000-0000-0000-0000000000011',
  'a forged owner or version on insert is replaced'
);
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  update public.workspace_designs set ciphertext = 'Zw==', version = 3
  where id = 'dddddddd-0000-0000-0000-00000000000f';
  raise exception 'FAIL: skipped a design version';
exception when sqlstate '40001' then
  raise notice 'PASS: design updates must increase the version by one';
end $$;
update public.workspace_designs set ciphertext = 'aA==', version = 2
where id = 'dddddddd-0000-0000-0000-00000000000f' and version = 1;
-- A writer that read version 1 too now matches no row.
update public.workspace_designs set ciphertext = 'c3RhbGU=', version = 2
where id = 'dddddddd-0000-0000-0000-00000000000f' and version = 1;
reset role;
select pg_temp.assert(
  (select ciphertext from public.workspace_designs
   where id = 'dddddddd-0000-0000-0000-00000000000f') = 'aA==',
  'a stale design update changes nothing'
);
delete from public.workspace_designs
where id = 'dddddddd-0000-0000-0000-00000000000f';

select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.assert(
  (select count(*) from public.workspace_designs) = 0,
  'other users cannot read a sealed design'
);
update public.workspace_designs set ciphertext = 'ZXZpbA==', version = 2;
reset role;
select pg_temp.assert(
  (select ciphertext from public.workspace_designs) = 'c2VhbGVk',
  'other users cannot overwrite a sealed design'
);

-- Images: only in the caller's own folder of the private bucket.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name)
values ('workspace-assets', 'aaaaaaaa-0000-0000-0000-000000000001/img-1');
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('workspace-assets', 'bbbbbbbb-0000-0000-0000-000000000002/img-2');
  raise exception 'FAIL: wrote into another user''s folder';
exception when insufficient_privilege then
  raise notice 'PASS: images can only be written to the caller''s folder';
end $$;

-- Shares: own live designs only.
insert into public.workspace_shares (id, design_id, user_id, title, width, height)
values ('5aaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-00000000000a',
        'bbbbbbbb-0000-0000-0000-000000000002', 'A poster', 1080, 1350);
insert into storage.objects (bucket_id, name)
values ('workspace-shares', '5aaaaaaa-0000-0000-0000-000000000001.png');
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('workspace-shares', 'not-my-share.png');
  raise exception 'FAIL: wrote an image for a share I don''t own';
exception when insufficient_privilege then
  raise notice 'PASS: share images can only be written for own shares';
end $$;
reset role;
select pg_temp.assert(
  (select user_id from public.workspace_shares)
    = 'aaaaaaaa-0000-0000-0000-000000000001',
  'share owner is always the caller'
);

select pg_temp.login('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.workspace_designs (id, ciphertext, iv, client_updated_at)
values ('dddddddd-0000-0000-0000-00000000000b', 'Yg==', 'BBBBBBBBBBBBBBBB', now());
do $$ begin
  insert into public.workspace_shares (design_id, title, width, height)
  values ('dddddddd-0000-0000-0000-00000000000a', 'stolen', 100, 100);
  raise exception 'FAIL: shared another user''s design';
exception when insufficient_privilege then
  raise notice 'PASS: cannot share another user''s design';
end $$;
reset role;

set role anon;
select pg_temp.assert(
  (select title from public.get_workspace_share(
    '5aaaaaaa-0000-0000-0000-000000000001')) = 'A poster',
  'anyone with the link can read the share'
);
select pg_temp.assert(
  not exists (select 1 from public.get_workspace_share(gen_random_uuid())),
  'an unknown token returns nothing'
);
do $$ begin
  perform count(*) from public.workspace_shares;
  raise exception 'FAIL: anon can list shares';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot list shares';
end $$;
reset role;

-- Deleting the design (a tombstone) kills the link at once.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
update public.workspace_designs
set deleted_at = now(), ciphertext = null, iv = null, version = 2
where id = 'dddddddd-0000-0000-0000-00000000000a';
reset role;
set role anon;
select pg_temp.assert(
  not exists (select 1 from public.get_workspace_share(
    '5aaaaaaa-0000-0000-0000-000000000001')),
  'links to deleted designs stop working'
);
reset role;

-- Account deletion waits for images and share images, then cascades.
select pg_temp.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from storage.objects
where name = 'aaaaaaaa-0000-0000-0000-000000000001/img-1';
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: deleted account with a share image left';
exception when sqlstate 'P0001' then
  raise notice 'PASS: account deletion waits for share images';
end $$;
delete from storage.objects
where name = '5aaaaaaa-0000-0000-0000-000000000001.png';
select public.delete_my_account();
reset role;
select pg_temp.assert(
  not exists (select 1 from public.workspace_keys
              where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
    and not exists (select 1 from public.workspace_designs
                    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
    and not exists (select 1 from public.workspace_shares),
  'deleting the account removes its key, designs and share links'
);
select pg_temp.assert(
  (select count(*) from public.workspace_designs) = 1,
  'other users'' designs are untouched'
);
