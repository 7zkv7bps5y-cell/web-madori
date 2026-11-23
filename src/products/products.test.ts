import { describe, expect, it } from 'vitest';
import { createFurniture } from '../model/project';
import { parseProductCatalog, type Product } from './catalog';
import { bedSizeStandard, relatedProducts, similarProducts } from './recommend';

// テスト専用のダミー商品（実在の商品ではない）
const p = (id: string, category: Product['category'], extra: Partial<Product> = {}): Product => ({
  id,
  name: `テスト商品${id}`,
  category,
  shop: 'テスト',
  url: `https://example.com/${id}`,
  source: 'manual',
  updatedAt: '2026-11-22T00:00:00Z',
  ...extra,
});

describe('商品カタログ', () => {
  it('正しい形式を読み込み、重複 ID・https 以外の URL を拒否する', () => {
    expect(parseProductCatalog({ version: 1, products: [p('1', 'bed')] }).ok).toBe(true);
    expect(parseProductCatalog({ version: 1, products: [p('1', 'bed'), p('1', 'sofa')] }).ok).toBe(false);
    expect(parseProductCatalog({ version: 1, products: [{ ...p('1', 'bed'), url: 'http://example.com' }] }).ok).toBe(false);
    expect(parseProductCatalog({ version: 2, products: [] }).ok).toBe(false);
    expect(parseProductCatalog({ version: 1, products: [{ ...p('1', 'bed'), category: 'unknown' }] }).ok).toBe(false);
  });
});

describe('類似商品', () => {
  const sofa = createFurniture('sofa', { x: 0, y: 0 }, 'f'); // 1800×850
  const catalog = [
    p('near', 'sofa', { dimensions: { w: 1750, d: 850 } }),
    p('nearest', 'sofa', { dimensions: { w: 1800, d: 860 } }),
    p('far', 'sofa', { dimensions: { w: 2400, d: 900 } }),
    p('nodim', 'sofa'),
    p('bed', 'bed', { dimensions: { w: 1800, d: 850 } }),
  ];
  it('同じ種類で寸法が近い順。寸法が大きく違うもの・寸法不明・別の種類は出さない', () => {
    expect(similarProducts(sofa, catalog).map((x) => x.id)).toEqual(['nearest', 'near']);
  });
});

describe('関連商品', () => {
  const catalog = [
    p('sheet-s', 'sheet', { sizeStandards: ['single'] }),
    p('sheet-sd', 'sheet', { sizeStandards: ['semi-double'] }),
    p('sheet-nosize', 'sheet'),
    p('pillow', 'pillow'),
    p('cushion', 'cushion'),
  ];
  it('セミダブルベッドにはセミダブル対応のシーツだけ（規格不明のシーツは出さない）', () => {
    const bed = createFurniture('bed-semidouble', { x: 0, y: 0 }, 'f');
    const ids = relatedProducts(bed, catalog).map((x) => x.id);
    expect(ids).toContain('sheet-sd');
    expect(ids).toContain('pillow');
    expect(ids).not.toContain('sheet-s');
    expect(ids).not.toContain('sheet-nosize');
    expect(ids).not.toContain('cushion');
  });
  it('ベッドの幅を変えると規格も変わる', () => {
    expect(bedSizeStandard({ type: 'bed-single', w: 970 })).toBe('single');
    expect(bedSizeStandard({ type: 'bed-single', w: 1400 })).toBe('double');
    expect(bedSizeStandard({ type: 'sofa', w: 1400 })).toBeNull();
  });
  it('ソファにはクッション類。関連のない家具には出さない', () => {
    expect(relatedProducts(createFurniture('sofa', { x: 0, y: 0 }, 'f'), catalog).map((x) => x.id)).toEqual(['cushion']);
    expect(relatedProducts(createFurniture('fridge', { x: 0, y: 0 }, 'f'), catalog)).toEqual([]);
  });
});

import { loadProductCatalog, resetProductCatalogCache } from './catalog';

describe('商品カタログの読み込み', () => {
  it('場所が未設定なら読み込まない（通信もしない）', async () => {
    let called = 0;
    const f = (async () => {
      called++;
      return new Response('{}');
    }) as unknown as typeof fetch;
    resetProductCatalogCache();
    expect(await loadProductCatalog(f, null)).toEqual([]);
    expect(called).toBe(0);
  });
  it('ファイルがない・JSON でない・形式が違う場合は空', async () => {
    for (const res of [new Response('', { status: 404 }), new Response('<html>', { headers: { 'content-type': 'text/html' } }), new Response('{"version":9}', { headers: { 'content-type': 'application/json' } })]) {
      resetProductCatalogCache();
      expect(await loadProductCatalog((async () => res) as unknown as typeof fetch, '/products.json')).toEqual([]);
    }
  });
  it('正しいカタログを読み込む', async () => {
    resetProductCatalogCache();
    const body = JSON.stringify({ version: 1, products: [p('1', 'bed')] });
    const res = new Response(body, { headers: { 'content-type': 'application/json' } });
    expect((await loadProductCatalog((async () => res) as unknown as typeof fetch, '/products.json')).map((x) => x.id)).toEqual(['1']);
  });
  it('寸法の許容範囲は ±15%（ちょうど 15% は含み、それを超えると除く）', () => {
    const sofa = createFurniture('sofa', { x: 0, y: 0 }, 'f'); // 幅 1800・奥行 850
    const edge = [
      p('w+15', 'sofa', { dimensions: { w: 2070, d: 850 } }),
      p('w-15', 'sofa', { dimensions: { w: 1530, d: 850 } }),
      p('w+16', 'sofa', { dimensions: { w: 2088, d: 850 } }),
      p('d+16', 'sofa', { dimensions: { w: 1800, d: 986 } }),
    ];
    expect(similarProducts(sofa, edge, 10).map((x) => x.id).sort()).toEqual(['w+15', 'w-15']);
  });
  it('不正な入力（https 以外の画像・負の価格・長すぎる名前・規格の誤り）を拒否', () => {
    for (const bad of [
      { ...p('1', 'bed'), imageUrl: 'javascript:alert(1)' },
      { ...p('1', 'bed'), priceJpy: -1 },
      { ...p('1', 'bed'), name: 'あ'.repeat(201) },
      { ...p('1', 'sheet'), sizeStandards: ['huge'] },
      { ...p('1', 'bed'), affiliateUrl: 'http://example.com' },
    ]) {
      expect(parseProductCatalog({ version: 1, products: [bad] }).ok).toBe(false);
    }
  });
});
