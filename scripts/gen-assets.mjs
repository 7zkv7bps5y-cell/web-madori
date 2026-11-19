// テンプレートのサムネイル（public/templates/*.svg）を生成する。テンプレートを変更したら実行: npm run gen:assets
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const mod = await server.ssrLoadModule('/src/site/renderTemplates.ts');
  const items = await mod.renderTemplateAssets();
  mkdirSync('public/templates', { recursive: true });
  for (const it of items) {
    writeFileSync(`public/templates/${it.id}.svg`, it.svg);
    console.log(`public/templates/${it.id}.svg  ${it.name}  ${it.area.toFixed(1)}㎡  ${(it.svg.length / 1024).toFixed(0)}KB`);
  }
} finally {
  await server.close();
}
