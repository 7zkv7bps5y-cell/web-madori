# クラウド保存・プラン管理の利用開始手順（Supabase）

コード（画面・データベース設計・テスト）は実装済み。**以下の設定を行うまで、クラウド保存は「準備中」と表示され、使えない。**
ローカル保存・画像・PDF・.floorplan はこれまでどおり制限なく使える。

## 1. Supabase プロジェクトを作る

1. https://supabase.com にログインし「New project」を押す
   - **Region: Northeast Asia (Tokyo)**（利用者が日本のため）
   - Database Password は自動生成でよい。安全な場所に保管し、リポジトリ・チャットには書かない
2. 左のメニュー **SQL Editor** →「New query」に `supabase/migrations/20261122000000_cloud_storage.sql` の中身を**すべて**貼り付けて「Run」
   - 作られるもの: `plans`（プラン）・`entitlements`（有料権限）・`floorplans`（保存した間取り）・関数・トリガー・RLS
   - Supabase CLI を使う場合: `supabase link --project-ref （プロジェクトID）` → `supabase db push`
3. 同じ SQL Editor で、次の確認用 SQL を実行し、結果が期待どおりか確認する

```sql
-- (a) RLS が 3 つの表すべてで有効（relrowsecurity がすべて true）
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname in ('plans', 'entitlements', 'floorplans');

-- (b) プランの値（free: 3 件・広告あり / premium: 30 件・広告なし・500 円）
select * from public.plans order by sort_order;

-- (c) 利用者（anon / authenticated）に TRUNCATE などの危険な権限が残っていない（0 行なら OK）
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');

-- (d) テスト用の権限が無効（本番では null か off）
select current_setting('app.allow_test_entitlements', true);
```

4. 左のメニュー **Database → Advisors（Security Advisor）** を開き、警告が出ていないことを確認する

## 2. 認証（メールのログイン）の設定

左のメニュー **Authentication** で:

| 画面 | 設定 |
| --- | --- |
| Sign In / Providers → Email | **Enable Email provider: ON**。「Confirm email」は ON のままでよい |
| URL Configuration → Site URL | 本番の URL（例: `https://example.com`）。試験公開だけなら `https://web-madori-trial.vercel.app` |
| URL Configuration → Redirect URLs | `https://（本番ドメイン）/editor/` を追加。試験公開も使うなら `https://web-madori-trial.vercel.app/editor/` も追加 |
| Emails（Email Templates）→ **Magic Link** と **Confirm signup** | 下の日本語の文面に変更する（**`{{ .Token }}` を必ず入れる**） |
| Emails → SMTP Settings | **本番では独自の SMTP を設定する**（Resend・SendGrid など）。標準の送信は 1 時間あたりの送信数が少なく本番運用には向かない |
| Rate Limits | メール送信の上限を確認（SMTP 設定後に上げられる） |

**メールの文面（Magic Link・Confirm signup 共通の例）**

- 件名: `Web間取り ログイン用のメール`
- 本文:

```html
<p>Web間取りのログイン用メールです。</p>
<p><a href="{{ .ConfirmationURL }}">こちらを押してログイン</a></p>
<p>別の端末でこのメールを見ている場合は、ログイン画面に次の 6 桁のコードを入力してください。</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>このメールに心当たりがない場合は、何もせずに削除してください。</p>
```

> リンクは「ログイン用メールを申し込んだのと同じブラウザ」で開いたときだけ有効（安全のための仕組み）。
> パソコンで申し込んでスマホでメールを開く場合などは、6 桁のコードでログインする。そのため文面に `{{ .Token }}` が必要。

## 3. Vercel の環境変数

Vercel の **Project → Settings → Environment Variables** で追加する（Environment は **Production** と、必要なら **Preview** にチェック）。
値はビルド時に埋め込まれるため、**追加・変更したら再デプロイ（Redeploy）する**。

| 変数 | 値 | 取得場所 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://（プロジェクトID）.supabase.co` | Supabase: Project Settings → API（Data API）→ Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon（public）キー、または publishable キー（`sb_publishable_…`） | Supabase: Project Settings → API Keys |

- anon / publishable キーはブラウザに公開される前提のキー。データの保護は RLS（行単位のアクセス制御）で行っている
- **service_role キー・secret キー（`sb_secret_…`）は絶対にフロントエンドの環境変数・リポジトリに入れない**
- `VITE_DEV_MOCK_CLOUD` は本番では設定しない（設定してもテスト用ビルド以外では無視される）

## 4. 動作確認

1. 本番（または検証用）URL の `/editor/` → メニュー「クラウド保存」→ メールアドレスを入力
2. 届いたメールのリンクを開く（または 6 桁のコードを入力）とログインされ、「無料プラン・保存 0 / 3 件」と表示される
3. 確認項目:
   - 3 件まで保存できる / 4 件目は保存できない（案内が出る） / 上書きしても件数が増えない / 複製で件数が増える
   - 削除後に新規保存できる / 別のアカウントでは一覧が空
   - 別の端末で同じアカウントにログインすると同じ一覧が出て、開いて編集・上書きできる
   - 2 つの端末で同じ間取りを開き、片方で上書きしたあともう片方で上書きすると確認が出る
   - ログアウト後に一覧が消える / 電波を切って保存すると、編集中の内容は消えずにエラーが出る
4. `docs/device-test-checklist.md` の保存・読み込みの項目も実施する

## 5. 有料プランの権限（決済は未接続）

- 権限は `entitlements` 表で管理する。**利用者自身は変更できない**（RLS とテストで確認済み）
- 決済サービス（例: Stripe）を接続するときは、決済完了の通知（Webhook）を受けるサーバー処理（Supabase Edge Functions など）から
  service_role で `entitlements` に `plan_id = 'premium', status = 'active', source = 'payment', current_period_end = 次回更新日` を書き込む
- 運営者が手動で付与する場合（SQL Editor で実行）:

```sql
insert into public.entitlements (user_id, plan_id, status, source, current_period_end, note)
values ('（ユーザーID）', 'premium', 'active', 'manual', now() + interval '1 month', '手動付与の理由')
on conflict (user_id) do update set plan_id = excluded.plan_id, status = excluded.status,
  source = excluded.source, current_period_end = excluded.current_period_end, note = excluded.note, updated_at = now();
```

- 開発用のテスト権限: `source = 'test'` は、データベースに `app.allow_test_entitlements = 'on'` を設定した環境でだけ有効。
  **開発用プロジェクトでのみ** `alter database postgres set app.allow_test_entitlements = 'on';` を実行する（本番では実行しない）
- プランの件数・価格を変える場合は `src/billing/plans.ts` と `plans` 表の両方を変更する（`plans.test.ts` が一致を確認する）

## 6. 容量・通信量・バックアップ（目安。最新の条件は Supabase の料金ページで確認）

- 間取り 1 件のデータは数十 KB 程度（2 階建て・家具あり・複数案で約 10〜30KB）。無料 3 件なら 1 人あたり 100KB 程度
- 無料枠のデータベース容量・通信量を超える見込みになったら有料プランへ移行する
- バックアップ: 無料プランでは自動バックアップの取得・復元に制限がある。本番運用では有料プランの日次バックアップ、
  または定期的な `pg_dump` を検討する
- データ削除: クラウドの間取りは利用者が画面から削除できる。アカウント削除（`auth.users` の削除）で保存データも自動削除される
  （アカウント削除の画面は未実装。当面はお問い合わせで受け付け、運営者が Supabase の管理画面から削除する）

## 7. 広告（AdSense）

1. AdSense にサイトを登録し、審査を受ける
2. Vercel の環境変数に `VITE_ADSENSE_CLIENT`（`ca-pub-` で始まる ID）と `VITE_ADSENSE_SLOT`（広告ユニット ID）を設定して再デプロイ
   - `VITE_ADSENSE_CLIENT` を設定すると、ビルド時に **`/ads.txt`** とサイト確認用のタグ（`google-adsense-account`）が自動で出力される
   - `VITE_ADSENSE_SLOT` がない間は広告枠を表示しない（空の枠を出さない）
3. 表示の方針: 無料利用者のみ（有料プランは非表示）。間取りキャンバス内・操作ボタンの近くには表示しない（エディタではパーツ一覧の下に区切って「広告」と表示。スマホのエディタには出さない）
4. 「無料で間取りを作る」を押したときの広告: 独自の割り込み広告は実装しない（操作を妨げる広告は AdSense のポリシーや
   Better Ads Standards に反するおそれがあるため）。ページ移動の間に表示したい場合は、AdSense の自動広告の
   「全画面広告（Vignette）」を AdSense の管理画面で有効にする（Google 側の規約に沿って表示される）
5. 欧州など同意管理が必要な地域からの利用がある場合は、AdSense の「プライバシーとメッセージ」で同意メッセージ（CMP）を設定する
6. 有料利用者の判定: エディタでサーバーのプランを確認したときに記憶し、コンテンツページでも広告を出さない
   （別の端末では、一度エディタを開くまでコンテンツページに広告が出ることがある）

## 8. 商品紹介（アフィリエイト）

- `public/products.json` を置き、環境変数 `VITE_PRODUCT_CATALOG_URL=/products.json` を設定すると、家具の設定欄に「商品を探す（PR）」が表示される。
  未設定なら読み込み自体を行わない（通信もしない）
- 形式は `docs/products.sample.json` を参照（記入例。実在の商品ではない）。`src/products/catalog.ts` のスキーマで検証される
- 商品情報は各ショップ・アフィリエイトサービスの規約と API の利用条件に従って取得する（無許可のスクレイピングはしない）
- 紹介リンクには「PR」表示と `rel="sponsored"` が付く（ステルスマーケティング規制への対応）
