/**
 * サイト共通のヘッダー・フッター（ビルド時に各 HTML の目印へ埋め込む。vite.config.ts 参照）
 * ここは静的 HTML 文字列のみ。ブラウザ側の動作は site.ts。
 */

export const SITE_NAME = 'Web間取り';

/** サイトマップに載せるページ（パス） */
export const SITE_PAGES = [
  '/',
  '/editor/',
  '/guide/',
  '/templates/',
  '/articles/tatami-tsubo/',
  '/articles/furniture-layout/',
  '/privacy/',
  '/terms/',
  '/contact/',
];

export const SITE_HEADER = `
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><img src="/favicon.svg" width="28" height="28" alt="" />${SITE_NAME}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="メニューを開く">☰</button>
    <nav id="site-nav" class="site-nav" aria-label="サイト内メニュー">
      <a href="/guide/">使い方</a>
      <a href="/templates/">テンプレート</a>
      <a href="/articles/tatami-tsubo/">コラム</a>
      <a class="btn primary" href="/editor/">無料で間取りを作る</a>
    </nav>
  </div>
</header>`;

export const SITE_FOOTER = `
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-cols">
      <div>
        <p class="brand"><img src="/favicon.svg" width="24" height="24" alt="" />${SITE_NAME}</p>
        <p class="muted">ブラウザで使える無料の間取り作成ツール</p>
      </div>
      <nav aria-label="サービス">
        <h2>サービス</h2>
        <a href="/editor/">間取りを作る</a>
        <a href="/guide/">使い方ガイド</a>
        <a href="/templates/">間取りテンプレート</a>
      </nav>
      <nav aria-label="コラム">
        <h2>コラム</h2>
        <a href="/articles/tatami-tsubo/">畳・帖・㎡・坪の違い</a>
        <a href="/articles/furniture-layout/">家具配置と通路幅の目安</a>
      </nav>
      <nav aria-label="サイト情報">
        <h2>サイト情報</h2>
        <a href="/terms/">利用規約</a>
        <a href="/privacy/">プライバシーポリシー</a>
        <a href="/contact/">お問い合わせ</a>
      </nav>
    </div>
    <p class="copyright">© <span data-year></span> ${SITE_NAME}</p>
  </div>
</footer>`;

/** 広告枠。AdSense 未設定の間は CSS で非表示（site.ts が有効化する） */
export function adSlot(name: string): string {
  return `<aside class="ad-slot" data-ad-slot="${name}" aria-label="広告"></aside>`;
}
