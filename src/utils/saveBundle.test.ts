import { describe, expect, it } from 'vitest';
import { effectiveFormats, imageOptionsFor, SAVE_FORMATS } from './saveBundle';

describe('まとめて保存の形式', () => {
  it('初期状態の全形式は ZIP の例どおりのファイル名になる', () => {
    expect(SAVE_FORMATS.map((f) => f.zipName)).toEqual([
      'project.floorplan',
      'floorplan.png',
      'floorplan_dimensions.png',
      'floorplan_furniture.png',
      'floorplan.pdf',
    ]);
  });
  it('選択順に関係なく決まった順に並ぶ', () => {
    expect(effectiveFormats(['pdf', 'basic', 'project'])).toEqual(['project', 'basic', 'pdf']);
  });
  it('間取り図が 1 つも選ばれていなければ PDF は作らない', () => {
    expect(effectiveFormats(['project', 'pdf'])).toEqual(['project']);
    expect(effectiveFormats([])).toEqual([]);
  });
  it('3 種類の間取り図は寸法・家具の有無だけが違い、配置の設定は共通', () => {
    const [b, d, f] = (['basic', 'dimensions', 'furniture'] as const).map(imageOptionsFor);
    expect([b.dimensions, d.dimensions, f.dimensions]).toEqual([false, true, false]);
    expect([b.showFurniture, d.showFurniture, f.showFurniture]).toEqual([false, false, true]);
    for (const o of [d, f]) {
      expect({ ...o, dimensions: false, showFurniture: false }).toEqual({ ...b, dimensions: false, showFurniture: false });
    }
  });
});
