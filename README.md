# Web間取り

ブラウザだけで誰でも簡単に住宅の間取りを作れる、無料の間取り作成ツール（日本の住宅向け）。

## 開発

```bash
npm install
npm run dev        # 開発サーバー
npm test           # ユニットテスト（Vitest）
npm run build      # 型チェック + 本番ビルド（dist/）
```

## ページ構成（マルチページ）

| URL | ファイル | 内容 |
| --- | --- | --- |
| `/` | `index.html` | トップページ |
| `/editor/` | `editor/index.html` | 間取り作成アプリ（`?template=ID` でテンプレートを開く） |
| `/guide/` | `guide/index.html` | 使い方ガイド |
| `/templates/` | `templates/index.html` | 間取りテンプレート |
| `/articles/...` | `articles/*/index.html` | コラム |
| `/privacy/` `/terms/` `/contact/` | | プライバシーポリシー・利用規約・お問い合わせ |

- コンテンツページは静的 HTML（検索エンジン向け）。共通ヘッダー・フッター・広告枠は `src/site/layout.ts` で定義し、
  ビルド時に `<!--site:header-->` などの目印へ埋め込む（`vite.config.ts` の `sitePlugin`）。
- テンプレートのサムネイル（`public/templates/*.svg`）は `npm run gen:assets` で生成。テンプレートを変えたら再生成する。
- `robots.txt` は常に、`sitemap.xml`・canonical・OGP の URL は `VITE_SITE_URL` 設定時に出力。

## 公開前に設定・記入が必要なもの

`.env.example` を `.env` にコピーして設定する。

| 項目 | 内容 |
| --- | --- |
| `VITE_SITE_URL` | 公開 URL。canonical・OGP・sitemap.xml に使用 |
| `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT` | AdSense の ID。未設定の間は広告枠は表示されない（キャンバス内には出さない） |
| `VITE_CONTACT_EMAIL` | お問い合わせ送信先。未設定の間はフォームが「準備中」表示 |
| 利用規約・プライバシーポリシー | 【運営者名】【公開日】【管轄裁判所】を記入。公開前に専門家の確認を推奨 |

## 技術構成

- React + TypeScript + Vite
- 描画: **SVG**（座標系 = mm。拡大縮小しても線が鮮明・PNG 出力に同じ描画を再利用できる）
- 状態管理: Zustand（スナップショット方式の Undo / Redo、ドラッグ中の変更は 1 履歴にまとめる）
- 検証: Zod（ファイル読み込み・貼り付けデータの検証）

## ディレクトリ

| パス | 内容 |
| --- | --- |
| `src/model/types.ts` | プロジェクトのデータ定義（部屋・開口部・家具・フロア・設定） |
| `src/model/catalog.ts` | 部屋の種類・ドア/窓の種類の定義（標準サイズ・色） |
| `src/model/geometry.ts` | 共通壁の算出、上下左右への追加位置、スナップ、開口部の配置 |
| `src/model/project.ts` | 生成・保存形式（`.floorplan` = JSON）・検証 |
| `src/store/store.ts` | 編集操作と履歴 |
| `src/components/plan/` | 間取り図の描画（エディタと PNG 出力で共通） |
| `src/components/Canvas.tsx` | キャンバス操作（選択・移動・リサイズ・＋ボタン・パン/ズーム/ピンチ） |

## データ設計の要点

- 単位はすべて mm。グリッドは 455mm（半間 910mm の半分。設定で変更可）。1畳 = 1.62㎡（不動産表示規約）。
- **部屋**は矩形（`x, y, w, h`）。`type`（種類）と `style`（色・床模様・設備表示）は独立。
- **壁**は部屋の辺から自動算出（`computeWalls`）。同一直線上で重なる辺は 1 本に統合されるため共通壁は二重にならず、
  サイズ変更・削除のたびに再計算される。保存ファイルには `derived.walls / connections` として出力（3D 化など外部利用向け）。
- **ドア・窓**は「部屋 ID + 辺 + 辺の始点からの距離」で保持。部屋を移動すると一緒に動き、
  部屋を削除しても共有壁上のものは隣の部屋へ引き継がれる。
- **家具**は部屋とは別配列（`furniture`）。中心のワールド座標（mm）・幅 `w`・奥行き `d`・高さ `height`・回転（度）で保持。
  ローカル座標の上側（-y）が背面、下側（+y）が正面。間取り作成モードで部屋を動かすと、その部屋の中の家具も一緒に動く。
- **間取り案**（A案・B案…）: 1 プロジェクトに最大 10 案。編集中の案の中身はプロジェクト直下（`rooms` など）にあり、
  他の案は `plans[].content` に保持する。保存ファイル（形式 v2）では全案が `plans[]` に正規化される。v1 のファイルも読み込める。

## 保存形式（.floorplan / version 2）

```jsonc
{
  "format": "web-madori", "version": 2,
  "projectId": "...", "projectName": "...",
  "settings": { "gridSize": 455, "areaUnit": "tatami", ... },
  "activePlanId": "plan_...",
  "plans": [
    { "id": "plan_...", "name": "A案", "activeFloorId": "...",
      "floors": [...], "rooms": [...], "openings": [...], "furniture": [...],
      "derived": [{ "floorId": "...", "walls": [...], "connections": [...] }] }
  ]
}
```

## 将来機能を見越した設計（現時点では未実装）

過剰な実装は避け、データ構造で受け止められるようにしている。

| 将来機能 | 受け皿になる現在の設計 |
| --- | --- |
| 生活動線チェック（ドア開閉範囲・扉/引き出し・通路幅） | 家具の「正面 = ローカル +y」の約束、ドアの `hinge`/`swing`/`width`、壁の実体計算（`model/collision.ts` の `solidWallRects`）。可動範囲はカタログ側に寸法を足して同じ判定関数で扱える |
| 家具・壁の干渉 | **実装済み**（重なり・壁・部屋の外を警告。配置は禁止しない） |
| 家具商品連携・アフィリエイト | `Furniture.productId`（現在は常に `null`）。商品データは許諾を得た外部データとして別管理し、ID で参照する想定 |
| 間取りの共有・公開・複製 | 公開状態はサーバー側（例: Supabase）で `projectId` に紐づけて管理。複製は `cloneContent()`（ID を振り直す）を流用 |
| 複数階 | `floors[]` と各要素の `floorId`（UI は 1 階のみ） |
| 3D 化 | mm 単位の座標、`Floor.height`、`Furniture.height`、派生データの壁 |

