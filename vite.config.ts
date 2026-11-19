import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { adSlot, SITE_FOOTER, SITE_HEADER, SITE_PAGES } from './src/site/layout.ts';

/** 各ページの HTML（マルチページ構成。静的 HTML なので検索エンジンにそのまま読まれる） */
const PAGE_INPUTS: Record<string, string> = {
  top: 'index.html',
  editor: 'editor/index.html',
  guide: 'guide/index.html',
  templates: 'templates/index.html',
  tatami: 'articles/tatami-tsubo/index.html',
  furniture: 'articles/furniture-layout/index.html',
  privacy: 'privacy/index.html',
  terms: 'terms/index.html',
  contact: 'contact/index.html',
};

/**
 * サイト共通処理:
 * - <!--site:header--> <!--site:footer--> <!--site:ad:名前--> を共通 HTML に置き換え
 * - VITE_SITE_URL があれば canonical / og:url / og:image と sitemap.xml を出力
 * - robots.txt を出力
 */
function sitePlugin(siteUrl: string | undefined): Plugin {
  const base = siteUrl?.replace(/\/+$/, '');
  return {
    name: 'web-madori-site',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        let out = html
          .replace('<!--site:header-->', SITE_HEADER)
          .replace('<!--site:footer-->', SITE_FOOTER)
          .replace(/<!--site:ad:([\w-]+)-->/g, (_, name: string) => adSlot(name));
        if (base) {
          const path = ctx.path.replace(/index\.html$/, '');
          out = out.replace(
            '</head>',
            `  <link rel="canonical" href="${base}${path}" />\n` +
              `    <meta property="og:url" content="${base}${path}" />\n` +
              `    <meta property="og:image" content="${base}/og.png" />\n  </head>`,
          );
        }
        return out;
      },
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', base ? `Sitemap: ${base}/sitemap.xml` : ''].filter(Boolean).join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots + '\n' });
      if (base) {
        const urls = SITE_PAGES.map((p) => `  <url><loc>${base}${p}</loc></url>`).join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), sitePlugin(env.VITE_SITE_URL)],
    build: {
      rollupOptions: {
        input: Object.fromEntries(Object.entries(PAGE_INPUTS).map(([k, v]) => [k, resolve(process.cwd(), v)])),
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
