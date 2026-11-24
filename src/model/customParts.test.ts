import { describe, expect, it } from 'vitest';
import { addToLibrary, createCustomPart, defaultDesign, loadLibrary, MAX_LIBRARY, outlinePath, removeFromLibrary, renameLibraryPart, shapeFromPoints, simplify } from './customParts';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('カスタムパーツ', () => {
  it('自由描画の線は間引かれ、端点は残る', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 10, y: (i % 2) * 0.5 }));
    const s = simplify(line, 2);
    expect(s.length).toBeLessThan(5);
    expect(s[0]).toEqual(line[0]);
    expect(s[s.length - 1]).toEqual(line[49]);
  });

  it('点の集まりから外接矩形と -0.5〜0.5 の正規化座標を作る', () => {
    const r = shapeFromPoints([
      { x: 1000, y: 1000 },
      { x: 3000, y: 1000 },
      { x: 2000, y: 2000 },
    ])!;
    expect(r).toMatchObject({ x: 2000, y: 1500, w: 2000, h: 1000 });
    for (const [px, py] of r.points) {
      expect(Math.abs(px)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(py)).toBeLessThanOrEqual(0.5);
    }
  });

  it('点が足りない・小さすぎる図形は作らない', () => {
    expect(shapeFromPoints([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBeNull();
    expect(shapeFromPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }])).toBeNull();
  });

  it('形ごとに輪郭を描ける', () => {
    for (const shape of ['rect', 'circle', 'ellipse'] as const) {
      expect(outlinePath({ shape, w: 1000, h: 800, points: undefined })).toMatch(/^M/);
    }
    expect(outlinePath({ shape: 'polygon', w: 1000, h: 1000, points: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] })).toMatch(/Z$/);
  });

  it('マイパーツ（ライブラリ）: 保存・名前変更・削除。配置済みのパーツは変わらない', () => {
    const store = memStore();
    const part = createCustomPart({ ...defaultDesign('rect'), name: '収納棚' }, { x: 0, y: 0, w: 900, h: 450 }, 'f1');
    const lib = addToLibrary(part, store)!;
    expect(loadLibrary(store)).toHaveLength(1);
    expect(lib.design.name).toBe('収納棚');
    expect(lib).toMatchObject({ w: 900, h: 450, version: 1 });
    renameLibraryPart(lib.id, '本棚', store);
    expect(loadLibrary(store)[0].design.name).toBe('本棚');
    expect(part.name).toBe('収納棚');
    removeFromLibrary(lib.id, store);
    expect(loadLibrary(store)).toHaveLength(0);
  });

  it('ライブラリは上限まで。壊れたデータは無視する', () => {
    const store = memStore();
    const part = createCustomPart(defaultDesign('circle'), { x: 0, y: 0, w: 600, h: 600 }, 'f1');
    for (let i = 0; i < MAX_LIBRARY; i++) addToLibrary(part, store);
    expect(addToLibrary(part, store)).toBeNull();
    store.setItem('web-madori:custom-parts:v1', '{broken');
    expect(loadLibrary(store)).toEqual([]);
    expect(loadLibrary(null)).toEqual([]);
  });
});
