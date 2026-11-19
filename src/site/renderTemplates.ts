import { planStats } from '../model/stats';
import { TEMPLATES } from '../model/templates';
import { buildSvg } from '../utils/exportImage';

/** テンプレートのサムネイル SVG と概要（scripts/gen-assets.mjs から実行） */
export async function renderTemplateAssets() {
  const out: { id: string; name: string; description: string; area: number; svg: string }[] = [];
  for (const t of TEMPLATES) {
    const p = t.create();
    const { svg } = await buildSvg(p, {
      scale: 0.06,
      showGrid: false,
      background: 'white',
      showFixtures: true,
      showTitle: false,
      showFurniture: true,
    });
    out.push({ id: t.id, name: t.name, description: t.description, area: planStats(p).totalArea, svg });
  }
  return out;
}
