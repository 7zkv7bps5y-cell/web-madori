/**
 * 商品カタログ（家具・関連商品の紹介用）。家具の基本データ（furnitureCatalog）とは別に管理する。
 *
 * - 現在は手動登録（例: public/products.json を置き、VITE_PRODUCT_CATALOG_URL=/products.json）。
 *   未設定・ファイルなしなら商品紹介は表示しない
 * - 将来 Amazon・楽天市場などと連携する場合も、この形式に変換して読み込む（source に取得元を記録）
 * - 商品情報は各ショップの利用規約・API の利用条件に従って取得すること（無許可のスクレイピングはしない）
 * - 架空の商品を実在する商品として登録しないこと
 */
import { z } from 'zod';

/** 商品カテゴリ（家具そのもの＝類似商品の候補 / 一緒に使うもの＝関連商品の候補） */
export const PRODUCT_CATEGORIES = [
  // 家具・家電（furnitureCatalog の種類に対応）
  'bed',
  'sofa',
  'table',
  'chair',
  'tv-stand',
  'desk',
  'bookshelf',
  'shelf',
  'wardrobe',
  'cupboard',
  'fridge',
  'washer',
  'microwave',
  'tv',
  'aircon',
  'dining-table',
  // 関連商品
  'pillow',
  'comforter',
  'sheet',
  'mattress-pad',
  'cushion',
  'sofa-cover',
  'dining-chair',
  'table-mat',
  'desk-light',
  'desk-chair',
  'storage-goods',
  'rug',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** 寝具などの対応規格 */
export const SIZE_STANDARDS = ['single', 'semi-double', 'double', 'queen', 'king'] as const;
export type SizeStandard = (typeof SIZE_STANDARDS)[number];

export const SIZE_STANDARD_LABEL: Record<SizeStandard, string> = {
  single: 'シングル',
  'semi-double': 'セミダブル',
  double: 'ダブル',
  queen: 'クイーン',
  king: 'キング',
};

const url = z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'https の URL を指定してください');

export const productSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  category: z.enum(PRODUCT_CATEGORIES),
  /** 寸法 (mm)。家具の類似判定に使う */
  dimensions: z
    .object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive().optional() })
    .optional(),
  /** 対応規格（シーツ・掛け布団など） */
  sizeStandards: z.array(z.enum(SIZE_STANDARDS)).max(5).optional(),
  imageUrl: url.optional(),
  /** 価格（円・税込） */
  priceJpy: z.number().int().nonnegative().optional(),
  shop: z.string().min(1).max(100),
  url,
  /** アフィリエイト URL（あればこちらにリンクする） */
  affiliateUrl: url.optional(),
  /** 取得元（manual / amazon / rakuten など） */
  source: z.string().min(1).max(50).default('manual'),
  /** 商品情報の更新日時（ISO 8601） */
  updatedAt: z.string().min(10).max(40),
});
export type Product = z.infer<typeof productSchema>;

export const productCatalogSchema = z.object({
  version: z.literal(1),
  products: z.array(productSchema).max(5000),
});

export type CatalogParse = { ok: true; products: Product[] } | { ok: false; error: string };

export function parseProductCatalog(raw: unknown): CatalogParse {
  const r = productCatalogSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `商品カタログの形式が正しくありません（${i?.path.join('.')}: ${i?.message}）` };
  }
  const ids = new Set<string>();
  for (const p of r.data.products) {
    if (ids.has(p.id)) return { ok: false, error: `商品IDが重複しています（${p.id}）` };
    ids.add(p.id);
  }
  return { ok: true, products: r.data.products };
}

let cache: Promise<Product[]> | null = null;

/** 商品カタログの場所（VITE_PRODUCT_CATALOG_URL）。未設定なら商品紹介を使わない（読み込みもしない） */
export function productCatalogUrl(): string | null {
  const u = (import.meta.env.VITE_PRODUCT_CATALOG_URL as string | undefined)?.trim();
  return u ? u : null;
}

/**
 * 商品カタログを読み込む。場所が未設定・ファイルがない・形式が正しくない場合は空（商品紹介を出さない）。
 */
export function loadProductCatalog(fetcher: typeof fetch = fetch, url = productCatalogUrl()): Promise<Product[]> {
  if (!url) return Promise.resolve([]);
  cache ??= fetcher(url, { cache: 'no-cache' })
    .then(async (res) => {
      if (!res.ok) return [];
      if (!(res.headers.get('content-type') ?? '').includes('json')) return [];
      const r = parseProductCatalog(await res.json());
      if (!r.ok) {
        if (import.meta.env.DEV) console.warn(r.error);
        return [];
      }
      return r.products;
    })
    .catch(() => []);
  return cache;
}

/** テスト用: 読み込み結果の破棄 */
export function resetProductCatalogCache() {
  cache = null;
}
