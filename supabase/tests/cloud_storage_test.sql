-- クラウド保存・プラン管理のテスト（ローカルの PostgreSQL で scripts/test-db.sh から実行）
-- 失敗するとエラーで停止する
\set ON_ERROR_STOP on
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'
\set u3 '33333333-3333-3333-3333-333333333333'

insert into auth.users (id) values (:'u1'), (:'u2'), (:'u3');

create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected error "%" but statement succeeded: %', expected, stmt;
exception when others then
  if sqlerrm not like '%' || expected || '%' then
    raise exception 'expected error "%" but got "%" for: %', expected, sqlerrm, stmt;
  end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 共通のデータ（.floorplan と同じ形式）
\set doc '{"format":"web-madori","version":2,"projectName":"テスト","plans":[]}'

-- ===== 1. 無料ユーザー: 3 件まで =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);
insert into public.floorplans (name, data) values ('A', :'doc'), ('B', :'doc'), ('C', :'doc');
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('D', '{"format":"web-madori"}')$$, 'cloud_quota_exceeded');
do $$ begin
  if (select used from public.my_cloud_status()) <> 3 or (select cloud_limit from public.my_cloud_status()) <> 3 then
    raise exception 'status mismatch';
  end if;
end $$;
\echo 'OK 1: free user can save 3, 4th is rejected'

-- ===== 2. 上書きは件数を使わない =====
update public.floorplans set name = 'A2', data = jsonb_set(data, '{projectName}', '"上書き"') where name = 'A';
do $$ begin
  if (select count(*) from public.floorplans where name = 'A2' and data ->> 'projectName' = '上書き') <> 1 then raise exception 'overwrite failed'; end if;
end $$;
\echo 'OK 2: overwrite works at the limit'

-- ===== 3. 削除すると新規保存できる =====
delete from public.floorplans where name = 'B';
insert into public.floorplans (name, data) values ('E', :'doc');
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('F', '{"format":"web-madori"}')$$, 'cloud_quota_exceeded');
\echo 'OK 3: delete frees a slot'

-- ===== 4. 月が変わっても回復しない（作成日を 2 か月前にしても数える） =====
reset role;
update public.floorplans set created_at = now() - interval '2 months' where user_id = :'u1';
set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('G', '{"format":"web-madori"}')$$, 'cloud_quota_exceeded');
\echo 'OK 4: quota does not reset by month'

-- ===== 5. 別アカウントのデータは見えない・変えられない・消せない =====
select set_config('request.jwt.claim.sub', :'u2', false);
do $$ begin
  if (select count(*) from public.floorplans) <> 0 then raise exception 'u2 can see u1 rows'; end if;
end $$;
update public.floorplans set name = 'hacked';
delete from public.floorplans;
select pg_temp.expect_error(format($$insert into public.floorplans (user_id, name, data) values (%L, 'X', '{"format":"web-madori"}')$$, '11111111-1111-1111-1111-111111111111'), 'row-level security');
reset role;
do $$ begin
  if (select count(*) from public.floorplans where user_id = '11111111-1111-1111-1111-111111111111' and name = 'hacked') <> 0 then raise exception 'u2 modified u1'; end if;
  if (select count(*) from public.floorplans where user_id = '11111111-1111-1111-1111-111111111111') <> 3 then raise exception 'u2 deleted u1 rows'; end if;
end $$;
\echo 'OK 5: other users cannot read/update/delete/insert-as'

-- ===== 6. 所有者は変えられない =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);
select pg_temp.expect_error(format($$update public.floorplans set user_id = %L$$, '22222222-2222-2222-2222-222222222222'), 'owner_change_not_allowed');
\echo 'OK 6: cannot transfer ownership'

-- ===== 7. 利用者は自分の権限（プラン）を書き換えられない =====
select pg_temp.expect_error(format($$insert into public.entitlements (user_id, plan_id, status, source) values (%L, 'premium', 'active', 'payment')$$, '11111111-1111-1111-1111-111111111111'), 'permission denied');
select pg_temp.expect_error($$update public.plans set cloud_limit = 999$$, 'permission denied');
select pg_temp.expect_error(format($$select public.effective_plan(%L)$$, '22222222-2222-2222-2222-222222222222'), 'permission denied');
\echo 'OK 7: users cannot grant themselves premium or change plans'

-- ===== 8. 未ログイン（anon）は何もできない =====
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($$select * from public.floorplans$$, 'permission denied');
select pg_temp.expect_error($$select * from public.my_cloud_status()$$, 'permission denied');
\echo 'OK 8: anon has no access'

-- ===== 9. 有料（運営者・決済が付与）: 30 件 =====
reset role;
insert into public.entitlements (user_id, plan_id, status, source) values (:'u2', 'premium', 'active', 'payment');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u2', false);
insert into public.floorplans (name, data) select 'P' || g, :'doc' from generate_series(1, 30) g;
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('P31', '{"format":"web-madori"}')$$, 'cloud_quota_exceeded');
do $$ begin
  if (select plan_id from public.my_cloud_status()) <> 'premium' or (select show_ads from public.my_cloud_status()) then raise exception 'premium status wrong'; end if;
end $$;
\echo 'OK 9: premium user can save 30'

-- ===== 10. 期限切れ・解約 → 無料扱い（データは残り、新規だけ不可） =====
reset role;
update public.entitlements set current_period_end = now() - interval '1 day' where user_id = :'u2';
set role authenticated;
select set_config('request.jwt.claim.sub', :'u2', false);
do $$ begin
  if (select plan_id from public.my_cloud_status()) <> 'free' then raise exception 'expired should be free'; end if;
  if (select count(*) from public.floorplans) <> 30 then raise exception 'data must remain after downgrade'; end if;
end $$;
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('Q', '{"format":"web-madori"}')$$, 'cloud_quota_exceeded');
update public.floorplans set name = 'P1-edited' where name = 'P1';
\echo 'OK 10: after downgrade data remains, overwrite ok, new save blocked'

-- ===== 11. テスト用の権限は本番設定では無効 =====
reset role;
insert into public.entitlements (user_id, plan_id, status, source) values (:'u3', 'premium', 'active', 'test');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u3', false);
do $$ begin
  if (select plan_id from public.my_cloud_status()) <> 'free' then raise exception 'test entitlement must be ignored in production'; end if;
end $$;
select set_config('app.allow_test_entitlements', 'on', false);
do $$ begin
  if (select plan_id from public.my_cloud_status()) <> 'premium' then raise exception 'test entitlement should work when allowed'; end if;
end $$;
select set_config('app.allow_test_entitlements', 'off', false);
\echo 'OK 11: test entitlements only work when explicitly allowed'

-- ===== 12. データの形式・サイズ =====
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('bad', '{"format":"other"}')$$, 'floorplans_data_format');
select pg_temp.expect_error($$insert into public.floorplans (name, data) values ('', '{"format":"web-madori"}')$$, 'floorplans_name_check');
\echo 'OK 12: invalid data rejected'

-- ===== 13. アカウント削除でデータも削除 =====
reset role;
delete from auth.users where id = :'u1';
do $$ begin
  if (select count(*) from public.floorplans where user_id = '11111111-1111-1111-1111-111111111111') <> 0 then raise exception 'cascade failed'; end if;
end $$;
\echo 'OK 13: deleting the account deletes its data'

-- ===== 14. 表の一括削除（TRUNCATE）などの権限がない（RLS が効かない操作） =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'u2', false);
select pg_temp.expect_error($$truncate public.floorplans$$, 'permission denied');
select pg_temp.expect_error($$truncate public.entitlements$$, 'permission denied');
select pg_temp.expect_error($$truncate public.plans$$, 'permission denied');
reset role;
do $$ begin
  if exists (
    select 1 from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated') and table_schema = 'public'
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then raise exception 'dangerous privileges remain'; end if;
end $$;
\echo 'OK 14: no TRUNCATE/REFERENCES/TRIGGER for anon/authenticated'

-- ===== 15. 更新日時を条件にした上書き（ほかの端末での更新の検出）=====
insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
insert into public.floorplans (name, data) values ('家', :'doc');
select set_config('test.loaded_at', updated_at::text, false) from public.floorplans where name = '家';
select pg_sleep(0.01);
update public.floorplans set name = '家（スマホ）' where name = '家';
do $$ declare n int; begin
  update public.floorplans set name = '家（PC）' where updated_at = current_setting('test.loaded_at')::timestamptz;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'stale overwrite should match 0 rows'; end if;
end $$;
reset role;
\echo 'OK 15: conditional overwrite detects updates from another device'
\echo 'ALL DATABASE TESTS PASSED'
