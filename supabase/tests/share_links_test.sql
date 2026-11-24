-- 共有リンクのテスト（scripts/test-db.sh から、cloud_storage_test.sql の後に実行）
\set ON_ERROR_STOP on
\set a '55555555-5555-5555-5555-555555555555'
\set b '66666666-6666-6666-6666-666666666666'
\set doc '{"format":"web-madori","version":3,"projectName":"Aの家","plans":[]}'
reset role;
insert into auth.users (id) values (:'a'), (:'b');

create or replace function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected error "%" but statement succeeded: %', expected, stmt;
exception when others then
  if sqlerrm not like '%' || expected || '%' then
    raise exception 'expected error "%" but got "%" for: %', expected, sqlerrm, stmt;
  end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

-- A が間取りを保存して共有リンクを発行
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false);
insert into public.floorplans (name, data) values ('Aの家', :'doc');
select set_config('test.fp', (select id::text from public.floorplans where name = 'Aの家'), false);
select set_config('test.token', (select token from public.issue_floorplan_share(current_setting('test.fp')::uuid)), false);
do $$ begin
  if current_setting('test.token') !~ '^[0-9a-f]{64}$' then raise exception 'token format'; end if;
end $$;
\echo 'OK S1: owner can issue a 64-char random share token'

-- 未ログイン（anon）で閲覧できる。返るのは名前・内容・更新日時だけ
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare r record; begin
  select * into r from public.get_shared_floorplan(current_setting('test.token'));
  if r.name is distinct from 'Aの家' or r.data ->> 'projectName' is distinct from 'Aの家' then raise exception 'shared view failed'; end if;
end $$;
select pg_temp.expect_error($$select * from public.floorplans$$, 'permission denied');
select pg_temp.expect_error($$select * from public.floorplan_shares$$, 'permission denied');
select pg_temp.expect_error(format($$select * from public.issue_floorplan_share(%L)$$, current_setting('test.fp')), 'permission denied');
\echo 'OK S2: anyone with the link can view; anon cannot list plans/shares or issue'

-- 間違った・推測した識別子では何も返らない
do $$ begin
  if exists (select 1 from public.get_shared_floorplan(repeat('0', 64))) then raise exception 'guessed token returned data'; end if;
  if exists (select 1 from public.get_shared_floorplan('x'' or ''1''=''1')) then raise exception 'injection returned data'; end if;
  if exists (select 1 from public.get_shared_floorplan('')) then raise exception 'empty token returned data'; end if;
end $$;
\echo 'OK S3: wrong or guessed tokens return nothing'

-- B（別のログイン利用者）は、A の共有一覧・間取りを見られず、A の間取りの共有を作れず、停止もできない
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'b', false);
do $$ begin
  if (select count(*) from public.floorplan_shares) <> 0 then raise exception 'B sees A shares'; end if;
  if (select count(*) from public.floorplans) <> 0 then raise exception 'B sees A plans'; end if;
end $$;
select pg_temp.expect_error(format($$select * from public.issue_floorplan_share(%L)$$, current_setting('test.fp')), 'row-level security');
delete from public.floorplan_shares;
update public.floorplans set name = 'hacked';
reset role;
do $$ begin
  if (select count(*) from public.floorplan_shares where token = current_setting('test.token')) <> 1 then raise exception 'B revoked A share'; end if;
  if (select name from public.floorplans where id = current_setting('test.fp')::uuid) <> 'Aの家' then raise exception 'B modified A plan'; end if;
end $$;
\echo 'OK S4: other users cannot list, issue, revoke, or edit through shares'

-- B が「自分のデータとして保存」= 自分の間取りとして新規作成（独立した複製）。A の元データは変わらない
set role authenticated;
select set_config('request.jwt.claim.sub', :'b', false);
insert into public.floorplans (name, data)
  select name || 'のコピー', data from public.get_shared_floorplan(current_setting('test.token'));
update public.floorplans set data = jsonb_set(data, '{projectName}', '"Bが編集"');
reset role;
do $$ begin
  if (select data ->> 'projectName' from public.floorplans where id = current_setting('test.fp')::uuid) <> 'Aの家' then raise exception 'copy affected original'; end if;
  if (select count(*) from public.floorplans where user_id = '66666666-6666-6666-6666-666666666666') <> 1 then raise exception 'copy not saved'; end if;
end $$;
\echo 'OK S5: saving a shared plan creates an independent copy'

-- 利用者が識別子を指定しても、サーバーの値に置き換わる。識別子の書き換えはできない
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false);
delete from public.floorplan_shares;
insert into public.floorplan_shares (floorplan_id, token) values (current_setting('test.fp')::uuid, repeat('a', 64));
do $$ begin
  if exists (select 1 from public.floorplan_shares where token = repeat('a', 64)) then raise exception 'client chose token'; end if;
end $$;
select pg_temp.expect_error($$update public.floorplan_shares set token = repeat('b', 64)$$, 'permission denied');
\echo 'OK S6: tokens are always generated by the server and cannot be changed'

-- 再発行で古いリンクは無効、停止でリンクは無効
select set_config('test.old', (select token from public.floorplan_shares limit 1), false);
select set_config('test.new', (select token from public.issue_floorplan_share(current_setting('test.fp')::uuid)), false);
do $$ begin
  if current_setting('test.old') = current_setting('test.new') then raise exception 'reissue same token'; end if;
  if exists (select 1 from public.get_shared_floorplan(current_setting('test.old'))) then raise exception 'old token still works'; end if;
  if not exists (select 1 from public.get_shared_floorplan(current_setting('test.new'))) then raise exception 'new token does not work'; end if;
end $$;
delete from public.floorplan_shares where floorplan_id = current_setting('test.fp')::uuid;
do $$ begin
  if exists (select 1 from public.get_shared_floorplan(current_setting('test.new'))) then raise exception 'revoked token still works'; end if;
end $$;
\echo 'OK S7: reissue invalidates the old link; stopping sharing invalidates the link'

-- 間取りを削除すると共有も消える。共有は保存件数に数えない
select set_config('test.t2', (select token from public.issue_floorplan_share(current_setting('test.fp')::uuid)), false);
do $$ begin
  if (select used from public.my_cloud_status()) <> 1 then raise exception 'share counted in quota'; end if;
end $$;
delete from public.floorplans where id = current_setting('test.fp')::uuid;
do $$ begin
  if exists (select 1 from public.get_shared_floorplan(current_setting('test.t2'))) then raise exception 'share survived delete'; end if;
end $$;
reset role;
do $$ begin
  if exists (
    select 1 from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated') and table_schema = 'public' and table_name = 'floorplan_shares'
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'UPDATE')
  ) then raise exception 'dangerous privileges on shares'; end if;
end $$;
\echo 'OK S8: deleting a plan deletes its share; shares do not use quota; no dangerous privileges'
\echo 'ALL SHARE LINK TESTS PASSED'
