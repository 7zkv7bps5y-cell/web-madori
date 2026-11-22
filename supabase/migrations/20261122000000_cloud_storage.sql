-- Web間取り: クラウド保存・プラン管理（Supabase 用）
--
-- 方針
-- * 保存上限は「同時に保持できる件数」。新規作成時だけ数え、月が変わっても回復しない。上書き（UPDATE）は件数を使わない
-- * 上限はデータベースのトリガーで強制する（画面側の確認を回避されても超えられない）
-- * 各ユーザーは自分のデータだけを読み書きできる（RLS）
-- * 有料プランの権限（entitlements）は利用者から変更できない。service_role（決済処理・運営者）のみが書き込む
-- * source = 'test' の権限は、データベース設定 app.allow_test_entitlements = 'on' の環境（開発用）でだけ有効
-- * プランの値は src/billing/plans.ts と一致させる

-- ---------------------------------------------------------------------------
-- プラン
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  cloud_limit integer not null check (cloud_limit >= 0),
  show_ads boolean not null,
  monthly_price_jpy integer not null default 0 check (monthly_price_jpy >= 0),
  sort_order integer not null default 0
);

insert into public.plans (id, name, cloud_limit, show_ads, monthly_price_jpy, sort_order) values
  ('free', '無料プラン', 3, true, 0, 0),
  ('premium', 'プレミアム', 30, false, 500, 1);

alter table public.plans enable row level security;
create policy "plans_readable" on public.plans for select using (true);
revoke insert, update, delete on public.plans from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 有料プランの権限（決済サービス連携・運営者の手動付与で service_role が書き込む）
-- ---------------------------------------------------------------------------
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null check (status in ('active', 'canceled', 'past_due')),
  source text not null check (source in ('payment', 'manual', 'test')),
  current_period_end timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
-- 自分の権限は読めるが、作成・変更・削除のポリシーは作らない（= 利用者は変更できない）
create policy "entitlements_select_own" on public.entitlements for select using (user_id = auth.uid());
revoke insert, update, delete on public.entitlements from anon, authenticated;

-- 有効なプラン（内部用。他人のプランを調べられないよう、利用者には実行権限を与えない）
create function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select e.plan_id
    from public.entitlements e
    where e.user_id = uid
      and e.status = 'active'
      and (e.current_period_end is null or e.current_period_end > now())
      and (e.source <> 'test' or coalesce(current_setting('app.allow_test_entitlements', true), 'off') = 'on')
  ), 'free');
$$;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- クラウド保存した間取り（.floorplan と同じ JSON をそのまま保存）
-- ---------------------------------------------------------------------------
create table public.floorplans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  data jsonb not null,
  format_version integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint floorplans_data_size check (pg_column_size(data) <= 5000000),
  constraint floorplans_data_format check (data ->> 'format' = 'web-madori')
);

create index floorplans_user_updated on public.floorplans (user_id, updated_at desc);

alter table public.floorplans enable row level security;
create policy "floorplans_select_own" on public.floorplans for select using (user_id = auth.uid());
create policy "floorplans_insert_own" on public.floorplans for insert with check (user_id = auth.uid());
create policy "floorplans_update_own" on public.floorplans for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "floorplans_delete_own" on public.floorplans for delete using (user_id = auth.uid());
revoke all on public.floorplans from anon;

-- 新規作成時: 保存件数の上限を確認（同じユーザーの同時保存でも超えないようロックする）
create function public.enforce_cloud_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  used integer;
begin
  -- 他人の名義での作成は、件数を調べる前に拒否する（他人の保存件数を漏らさないため）。
  -- auth.uid() が空なのは service_role（運営者・サーバー処理）からの操作のみ
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'new row violates row-level security policy for table "floorplans"';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select p.cloud_limit into lim from public.plans p where p.id = public.effective_plan(new.user_id);
  select count(*) into used from public.floorplans f where f.user_id = new.user_id;
  if used >= coalesce(lim, 0) then
    raise exception using
      errcode = 'P0001',
      message = 'cloud_quota_exceeded',
      detail = format('used=%s limit=%s', used, lim),
      hint = '保存済みのデータを削除するか、既存のデータに上書き保存してください';
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger floorplans_quota before insert on public.floorplans
  for each row execute function public.enforce_cloud_quota();

-- 更新時: 所有者・作成日時は変えられない
create function public.floorplans_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id <> old.user_id then
    raise exception using errcode = 'P0001', message = 'owner_change_not_allowed';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger floorplans_update before update on public.floorplans
  for each row execute function public.floorplans_before_update();

-- 画面表示用: 自分のプラン・上限・使用件数・広告表示
create function public.my_cloud_status()
returns table (plan_id text, cloud_limit integer, used integer, show_ads boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.cloud_limit,
         (select count(*)::integer from public.floorplans f where f.user_id = auth.uid()),
         p.show_ads
  from public.plans p
  where auth.uid() is not null and p.id = public.effective_plan(auth.uid());
$$;
revoke all on function public.my_cloud_status() from public, anon;
grant execute on function public.my_cloud_status() to authenticated;
