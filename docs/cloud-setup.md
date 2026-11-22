# クラウド保存・プラン管理の利用開始手順（Supabase）

コード（画面・データベース設計・テスト）は実装済み。**以下の設定を行うまで、クラウド保存は「準備中」と表示され、使えない。**
ローカル保存・画像・PDF・.floorplan はこれまでどおり制限なく使える。

## 1. Supabase プロジェクトを作る

1. https://supabase.com でアカウント・組織を作成し、新しいプロジェクトを作る
   - Region: **Northeast Asia (Tokyo)** を推奨（利用者が日本のため）
   - データベースのパスワードは安全に保管（リポジトリに書かない）
2. SQL Editor で `supabase/migrations/20261122000000_cloud_storage.sql` を実行する
   （または Supabase CLI で `supabase db push`）
   - 作られるもの: `plans`（プラン）・`entitlements`（有料権限）・`floorplans`（保存した間取り）・関数・トリガー・RLS

## 2. 認証（メールのログインリンク）の設定

Authentication の設定で:

| 項目 | 設定 |
| --- | --- |
| Providers > Email | 有効。パスワードなしのメールリンク（Magic Link / OTP）を使う |
| URL Configuration > Site URL | 本番の URL（例: `https://example.com`） |
| URL Configuration > Redirect URLs | `https://（本番ドメイン）/editor/`、試験公開を使うなら `https://web-madori-trial.vercel.app/editor/` |
| Email Templates | 日本語の文面に変更（件名例: 「Web間取り ログイン用リンク」） |
| SMTP Settings | **本番では独自の SMTP（Resend・SendGrid など）を設定する**。Supabase 標準の送信は送信数が少なく、本番運用には向かない |

## 3. Vercel の環境変数

Vercel のプロジェクト設定 > Environment Variables に追加し、再デプロイする:

| 変数 | 値 |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings > API の Project URL |
| `VITE_SUPABASE_ANON_KEY` | 同じ画面の anon（public）キー |

- anon キーはブラウザに公開される前提のキー。データの保護は RLS（行単位のアクセス制御）で行っている
- **service_role キーは絶対にフロントエンドの環境変数・リポジトリに入れない**
- `VITE_DEV_MOCK_CLOUD` は本番では設定しない（設定しても本番ビルドでは無視される）

## 4. 動作確認

1. 本番（または検証用）URL の `/editor/` → メニュー「クラウド保存」→ メールアドレスを入力
2. 届いたメールのリンクを開くとログインされ、「無料プラン・保存 0 / 3 件」と表示される
3. `docs/device-test-checklist.md` と、下の「確認項目」を実施する

確認項目: 3 件まで保存できる / 4 件目は保存できない / 上書きできる / 削除後に保存できる / 別のアカウントでは見えない /
ログアウト後に一覧が消える / 別の端末で同じアカウントにログインすると同じ一覧が出る。

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

- `VITE_ADSENSE_CLIENT` と `VITE_ADSENSE_SLOT` を設定すると、無料利用者に広告が表示される（有料プランは非表示）
- 間取りキャンバス内・操作ボタンの近くには表示しない（エディタではパーツ一覧の下のみ）
- 「無料で間取りを作る」を押したときの広告: 独自の割り込み広告は実装しない（操作を妨げる広告は AdSense のポリシーや
  Better Ads Standards に反するおそれがあるため）。ページ移動の間に表示する広告は、AdSense の自動広告の
  「全画面広告（Vignette）」を管理画面で有効にすることで Google 側の規約に沿って表示できる

## 8. 商品紹介（アフィリエイト）

- `public/products.json` を置くと、家具の設定欄に「商品を探す（PR）」が表示される。ファイルがなければ表示されない
- 形式は `docs/products.sample.json` を参照（記入例。実在の商品ではない）。`src/products/catalog.ts` のスキーマで検証される
- 商品情報は各ショップ・アフィリエイトサービスの規約と API の利用条件に従って取得する（無許可のスクレイピングはしない）
- 紹介リンクには「PR」表示と `rel="sponsored"` が付く（ステルスマーケティング規制への対応）
