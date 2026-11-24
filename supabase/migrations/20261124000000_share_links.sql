-- Web間取り: 共有リンク（閲覧専用）
--
-- 方針
-- * 共有リンクはクラウドに保存した間取り（floorplans）ごとに 1 つ。リンクを開いた人は「最新の保存内容」を閲覧だけできる
-- * 識別子（token）はサーバーで生成する 64 文字のランダムな値（gen_random_uuid 2 つ分、約 244 ビット）。利用者は指定できない
-- * 共有の作成・停止・再発行は持ち主だけ（RLS）。停止・再発行すると古いリンクはすぐに使えなくなる
-- * 閲覧は get_shared_floorplan(token) だけで行う。共有された 1 件の名前・内容・更新日時だけを返し、
--   ほかの間取り・持ち主の情報・共有の一覧は返さない。共有リンクからは編集・削除・所有者の変更はできない
-- * 間取りを削除すると共有も削除される。共有された間取りは保存件数に数えない（件数は floorplans で数える）

create table public.floorplan_shares (
  floorplan_id uuid primary key references public.floorplans (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  constraint floorplan_shares_token_format check (token ~ '^[0-9a-f]{64}$')
);

alter table public.floorplan_shares enable row level security;
create policy "shares_select_own" on public.floorplan_shares for select using (user_id = auth.uid());
-- 自分の間取りにだけ共有を作れる
create policy "shares_insert_own" on public.floorplan_shares for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.floorplans f where f.id = floorplan_id and f.user_id = auth.uid())
);
create policy "shares_delete_own" on public.floorplan_shares for delete using (user_id = auth.uid());
-- 更新（UPDATE）のポリシーは作らない（識別子・対象の付け替えはできない。再発行は削除して作り直す）
revoke all on public.floorplan_shares from anon, authenticated;
grant select, insert, delete on public.floorplan_shares to authenticated;

-- 識別子は常にサーバーで生成する（利用者が推測しやすい値を指定できないように）
create function public.floorplan_shares_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  new.created_at := now();
  return new;
end;
$$;

create trigger floorplan_shares_token before insert on public.floorplan_shares
  for each row execute function public.floorplan_shares_before_insert();

-- 共有リンクの発行・再発行（既存のリンクは無効になる）。呼び出した本人の権限（RLS）で動く
create function public.issue_floorplan_share(p_floorplan_id uuid)
returns table (floorplan_id uuid, token text, created_at timestamptz)
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.floorplan_shares s where s.floorplan_id = p_floorplan_id;
  return query
    insert into public.floorplan_shares as s (floorplan_id) values (p_floorplan_id)
    returning s.floorplan_id, s.token, s.created_at;
end;
$$;
revoke all on function public.issue_floorplan_share(uuid) from public, anon;
grant execute on function public.issue_floorplan_share(uuid) to authenticated;

-- 共有リンクの閲覧（ログイン不要）。識別子が正しい形式で、共有中の 1 件だけを返す
create function public.get_shared_floorplan(p_token text)
returns table (name text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.name, f.data, f.updated_at
  from public.floorplan_shares s
  join public.floorplans f on f.id = s.floorplan_id
  where p_token ~ '^[0-9a-f]{64}$' and s.token = p_token;
$$;
revoke all on function public.get_shared_floorplan(text) from public;
grant execute on function public.get_shared_floorplan(text) to anon, authenticated;

-- 内部用の関数は利用者から直接呼べないようにする
revoke all on function public.floorplan_shares_before_insert() from public, anon, authenticated;
