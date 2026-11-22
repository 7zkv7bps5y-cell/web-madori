/**
 * 家具に合う商品の候補（類似商品・関連商品）。
 * - 類似商品: 同じ種類で、幅・奥行き（・高さ）が近いもの。寸法の差が大きいものは出さない
 * - 関連商品: 一緒に使うもの。寝具など規格が重要なものは、対応規格が一致するものだけを出す
 */
import type { Furniture } from '../model/types';
import type { Product, ProductCategory, SizeStandard } from './catalog';

/** 家具の種類 → 商品カテゴリ（類似商品） */
export const FURNITURE_PRODUCT_CATEGORY: Record<string, ProductCategory | undefined> = {
  'bed-single': 'bed',
  'bed-semidouble': 'bed',
  'bed-double': 'bed',
  sofa: 'sofa',
  table: 'table',
  chair: 'chair',
  'tv-stand': 'tv-stand',
  desk: 'desk',
  bookshelf: 'bookshelf',
  shelf: 'shelf',
  wardrobe: 'wardrobe',
  cupboard: 'cupboard',
  fridge: 'fridge',
  washer: 'washer',
  microwave: 'microwave',
  tv: 'tv',
  aircon: 'aircon',
  'dining-table': 'dining-table',
};

/** 関連商品のカテゴリ */
export const RELATED_CATEGORIES: Record<string, ProductCategory[]> = {
  bed: ['pillow', 'comforter', 'sheet', 'mattress-pad'],
  sofa: ['cushion', 'sofa-cover', 'rug'],
  'dining-table': ['dining-chair', 'table-mat'],
  desk: ['desk-light', 'desk-chair'],
  'tv-stand': ['tv', 'storage-goods'],
};

/** 規格が合わないと使えないカテゴリ（規格の情報がない商品は出さない） */
export const SIZE_CRITICAL: ProductCategory[] = ['sheet', 'comforter', 'mattress-pad'];

/** ベッドの規格。種類から決め、幅を変えている場合は幅から判定する */
export function bedSizeStandard(f: Pick<Furniture, 'type' | 'w'>): SizeStandard | null {
  if (!f.type.startsWith('bed-')) return null;
  const w = f.w;
  if (w < 1050) return 'single';
  if (w < 1300) return 'semi-double';
  if (w < 1500) return 'double';
  if (w < 1700) return 'queen';
  return 'king';
}

/** 寸法の許容差（±15%） */
const TOLERANCE = 0.15;

export function similarProducts(f: Furniture, products: Product[], limit = 3): Product[] {
  const cat = FURNITURE_PRODUCT_CATEGORY[f.type];
  if (!cat) return [];
  const scored: { p: Product; score: number }[] = [];
  for (const p of products) {
    if (p.category !== cat || !p.dimensions) continue;
    const dw = Math.abs(p.dimensions.w - f.w) / f.w;
    const dd = Math.abs(p.dimensions.d - f.d) / f.d;
    if (dw > TOLERANCE || dd > TOLERANCE) continue;
    const dh = p.dimensions.h ? Math.abs(p.dimensions.h - f.height) / f.height : 0;
    scored.push({ p, score: dw + dd + dh * 0.5 });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.p);
}

export function relatedProducts(f: Furniture, products: Product[], perCategory = 2): Product[] {
  const cat = FURNITURE_PRODUCT_CATEGORY[f.type];
  const related = cat ? RELATED_CATEGORIES[cat] ?? [] : [];
  const size = bedSizeStandard(f);
  const out: Product[] = [];
  for (const rc of related) {
    const matches = products.filter((p) => {
      if (p.category !== rc) return false;
      if (SIZE_CRITICAL.includes(rc)) return !!size && !!p.sizeStandards?.includes(size);
      return true;
    });
    // 規格が合うものを優先
    matches.sort((a, b) => Number(!!size && !!b.sizeStandards?.includes(size)) - Number(!!size && !!a.sizeStandards?.includes(size)));
    out.push(...matches.slice(0, perCategory));
  }
  return out;
}
