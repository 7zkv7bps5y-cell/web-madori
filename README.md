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

## 保存・出力（まとめて保存）

「保存」ボタン → 保存・出力画面（`components/SaveDialog.tsx` / `utils/saveBundle.ts`）。

| 形式 | ZIP 内のファイル名 | 内容 |
| --- | --- | --- |
| 編集用データ | `project.floorplan` | 全階・全案を含む再編集用データ（「開く」で復元） |
| 基本間取り図 | `floorplan.png` | 部屋の形・配置・部屋名・広さ |
| 寸法付き間取り図 | `floorplan_dimensions.png` | 部屋ごとの横×縦・畳数・㎡ と外周の寸法線 |
| 家具配置付き間取り図 | `floorplan_furniture.png` | 家具・家電を含む |
| PDF | `floorplan.pdf` | 選んだ間取り図を A4 に 1 枚ずつ |

- 初期状態はすべて ON。1 形式なら単独ファイル、複数なら ZIP（`utils/zip.ts`、無圧縮・依存なし）で 1 回のダウンロード。
- **整合性**: 保存画面を開いた時点の 1 つのプロジェクトから全形式を生成する。3 種類の間取り図は「寸法を描くか・家具を描くか」だけが異なり、
  配置・縮尺は共通（`imageOptionsFor`）。プレビューは出力と同じ SVG を表示する。

### 実機テスト

保存・読み込みの実機確認項目は [docs/device-test-checklist.md](docs/device-test-checklist.md)。

### 将来の改善候補（未実装）

- 案ごとの間取り図の一括出力（現在の画像・PDF は編集中の案のみ。編集用データは全案）
- 実際の画面の場所を指し示す吹き出し形式の操作ガイド

### 開発メモ: テスト環境でファイル名が「download」になる件

Linux の OS ロケールが POSIX（ASCII のみ）だと、Chromium は日本語などのファイル名を OS の文字コードに変換できず、
既定名「download」で保存する。アプリ側の不具合ではない（UTF-8 環境の PC・スマホでは日本語名で保存される）。
Playwright で確認するときは `chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })` で起動する。

## クラウド保存・プラン・広告・商品紹介（収益化の土台）

利用開始の手順は [docs/cloud-setup.md](docs/cloud-setup.md)、監査結果と準備状況は [docs/launch-readiness.md](docs/launch-readiness.md)。Supabase の設定をするまでは「準備中」と表示される。

| 部分 | ファイル |
| --- | --- |
| プラン設定（唯一の定義: 無料 3 件・有料 30 件・広告・価格） | `src/billing/plans.ts` |
| データベース（プラン・有料権限・保存した間取り・RLS・保存上限のトリガー） | `supabase/migrations/20261122000000_cloud_storage.sql` |
| データベース（共有リンク: 閲覧専用・停止・再発行） | `supabase/migrations/20261124000000_share_links.sql` |
| 共有画面・閲覧モード | `src/components/SharingDialog.tsx`、`src/components/ViewerPanel.tsx`、`src/App.tsx`（`ViewerBanner`） |
| カスタムパーツ・マイパーツ | `src/model/customParts.ts`、`src/components/CustomPart*.tsx`、`src/components/plan/CustomPartShape.tsx` |
| パーツ別の参考情報（画像・URL・メモ） | `src/components/PartInfo.tsx`、`src/utils/images.ts`、`src/model/project.ts`（検証） |
| データベースのテスト（ローカル PostgreSQL） | `scripts/test-db.sh`、`supabase/tests/` |
| クラウド保存の窓口（Supabase 版 / テスト専用の模擬版） | `src/cloud/` |
| ログイン状態・保存一覧 | `src/store/account.ts`、`src/components/CloudDialog.tsx` |
| 広告（プランで出し分け） | `src/site/ads.ts` |
| 商品カタログ・類似商品・関連商品 | `src/products/`、`src/components/ProductSuggestions.tsx` |

- 保存上限は「同時に保持できる件数」。新規保存・複製だけが数え、上書きは数えない。月が変わっても回復しない。データベースのトリガーで強制する
- 有料の権限は `entitlements` 表で管理し、利用者は変更できない。テスト用の権限（`source = 'test'`）は開発用データベースでのみ有効
- クラウド保存に失敗しても、編集中の間取りには影響しない（ローカルの自動保存も続く）
- PNG・PDF・.floorplan の出力に回数制限はない。Office 系（Excel など）の出力は現時点で存在しない
- テスト用ビルド: `VITE_DEV_MOCK_CLOUD=1 npx vite build --mode e2e --outDir dist-e2e`（模擬クラウドは本番ビルドに含まれない）

## データ設計の要点

- 単位はすべて mm。グリッドは 455mm（半間 910mm の半分。設定で変更可）。1畳 = 1.62㎡（不動産表示規約）。
- **部屋**は矩形（`x, y, w, h`）。`type`（種類）と `style`（色・床模様・設備表示）は独立。
- **壁**は部屋の辺から自動算出（`computeWalls`）。同一直線上で重なる辺は 1 本に統合されるため共通壁は二重にならず、
  サイズ変更・削除のたびに再計算される。保存ファイルには `derived.walls / connections` として出力（3D 化など外部利用向け）。
- **階段**は部屋の一種（`type: 'stairs'`）。部屋同士の重なりは原則不可だが、階段だけは「1 つの屋内の部屋の中に完全に収まる」
  位置に置ける（リビング階段）。その場合は壁を作らず外形線だけを描き、床面積は二重に数えない。部屋を動かす・回すと中の階段も一緒に動く。
  部屋の境界をまたぐ・一部だけ重なる・バルコニーや別の階段と重なる配置は置けない。家具が階段の範囲（描画と同じ矩形）に重なると警告する。
- **ドア・窓**は「部屋 ID + 辺 + 辺の始点からの距離」で保持。部屋を移動すると一緒に動き、
  部屋を削除しても共有壁上のものは隣の部屋へ引き継がれる。
- **家具**は部屋とは別配列（`furniture`）。中心のワールド座標（mm）・幅 `w`・奥行き `d`・高さ `height`・回転（度）で保持。
  ローカル座標の上側（-y）が背面、下側（+y）が正面。間取り作成モードで部屋を動かすと、その部屋の中の家具も一緒に動く。
- **間取り案**（A案・B案…）: 1 プロジェクトに最大 10 案。編集中の案の中身はプロジェクト直下（`rooms` など）にあり、
  他の案は `plans[].content` に保持する。保存ファイル（形式 v3）では全案が `plans[]` に正規化される。v1・v2 のファイルも読み込める。
- **カスタムパーツ**は家具とも部屋とも別の配列（`customParts`）。中心座標・`w`・`h`・回転・形（rect / circle / ellipse / polygon / freehand）・
  見た目（色・枠線・透明度・模様・文字）。多角形・自由描画の頂点は外接矩形に対して -0.5〜0.5 に正規化して保持するので、拡大縮小しても形が崩れない。
  マイパーツ（再利用ライブラリ）はブラウザの localStorage（`web-madori:custom-parts:v1`）に、1 件ずつ ID・形式バージョン付きで保存（将来のユーザー間共有に備える）。
  置いたパーツは間取りデータ側にコピーされるため、ライブラリがない端末・共有先でも同じ表示になる。
- **参考情報**（`info`）は部屋・ドア/窓・家具・カスタムパーツに任意で付く（タイトル・商品名・価格・説明・仕様・メモ・リンク 20 件・画像 20 件）。
  図面（画面・PNG・PDF）には描かない。リンクは http/https、画像 URL は https のみ。端末の写真は長辺 1024px の JPEG（約 200KB 以下・EXIF なし）に変換して
  データ URL で埋め込み、1 つの間取りで合計 1.5MB まで。読み込み時にも同じ規則で検証する。
- **共有リンク**: `/editor/?share=（64 桁の乱数）`。トークンはデータベースが発行し、`get_shared_floorplan` だけが（ログインなしで）
  名前・内容・更新日時を返す。表示はクラウドに保存した最新版。閲覧モードでは編集・自動保存をしない。
  「自分のデータとして保存」で新しい `projectId` の複製を自分のクラウドに保存する。従来の URL 共有（`#p=`）もそのまま使える。

## 保存形式（.floorplan / version 3）

```jsonc
{
  "format": "web-madori", "version": 3,
  "projectId": "...", "projectName": "...",
  "settings": { "gridSize": 455, "areaUnit": "tatami", ... },
  "activePlanId": "plan_...",
  "plans": [
    { "id": "plan_...", "name": "A案", "activeFloorId": "...",
      "floors": [...], "rooms": [...], "openings": [...], "furniture": [...], "customParts": [...],
      "derived": [{ "floorId": "...", "walls": [...], "connections": [...] }] }
  ]
}
```

## 将来機能を見越した設計（現時点では未実装）

過剰な実装は避け、データ構造で受け止められるようにしている。

| 将来機能 | 受け皿になる現在の設計 |
| --- | --- |
| 生活動線チェック（ドア開閉範囲・扉/引き出し・通路幅・改善提案） | **実装済み**（`model/flowCheck.ts`）。家具の正面に必要な空きはカタログの `front`、通路幅の対象外は `noPassageCheck` で定義。判定は目安として表示し、配置は禁止しない |
| 家具・壁の干渉 | **実装済み**（重なり・壁・部屋の外を警告。配置は禁止しない） |
| 家具商品連携・アフィリエイト | `Furniture.productId`（現在は常に `null`）。商品データは許諾を得た外部データとして別管理し、ID で参照する想定 |
| 間取りの共有・公開・複製 | **実装済み**（閲覧専用の共有リンク・停止・再発行・「自分のデータとして保存」。`floorplan_shares` 表） |
| 複数階 | **実装済み**（最大 4 階。階タブ、下の階の薄表示、全階を並べた画像・PDF 出力） |
| PDF 出力 | **実装済み**（`utils/exportPdf.ts`。日本語フォントを埋め込まずに済むよう、ページは高解像度画像。縮尺 1/100・1/50 指定可） |
| URL 共有 | **実装済み**（`utils/share.ts`。deflate 圧縮して URL の `#p=` に格納。サーバーへは送信されない） |
| 3D 化 | mm 単位の座標、`Floor.height`、`Furniture.height`、派生データの壁 |

