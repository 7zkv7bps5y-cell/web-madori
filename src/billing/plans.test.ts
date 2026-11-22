import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canCreateCloudSave, PLANS, planConfig } from './plans';

describe('プラン設定', () => {
  it('無料 3 件・有料 30 件・有料は広告なし', () => {
    expect(PLANS.free).toMatchObject({ cloudLimit: 3, showAds: true, monthlyPriceJpy: 0 });
    expect(PLANS.premium).toMatchObject({ cloudLimit: 30, showAds: false, monthlyPriceJpy: 500 });
  });
  it('不明なプランは無料扱い', () => {
    expect(planConfig(undefined).id).toBe('free');
    expect(planConfig('unknown').id).toBe('free');
  });
  it('保存上限は「同時に保持できる件数」', () => {
    expect(canCreateCloudSave(2, 3)).toBe(true);
    expect(canCreateCloudSave(3, 3)).toBe(false);
    expect(canCreateCloudSave(31, 30)).toBe(false); // 解約後に上限を超えていても新規は不可
  });
  it('Office 系の出力は未提供（回数を決めていない）。PNG/PDF/.floorplan の制限項目は持たない', () => {
    for (const p of Object.values(PLANS)) {
      expect(p.officeExportsPerMonth).toBeNull();
      expect(Object.keys(p).some((k) => /png|pdf|floorplan/i.test(k))).toBe(false);
    }
  });
  it('データベースの初期値（マイグレーション）と一致する', () => {
    const dir = join(__dirname, '../../supabase/migrations');
    const sql = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    for (const p of Object.values(PLANS)) {
      const re = new RegExp(`\\('${p.id}',\\s*'([^']+)',\\s*(\\d+),\\s*(true|false),\\s*(\\d+)`);
      const m = re.exec(sql);
      expect(m, `plans 表に ${p.id} がない`).not.toBeNull();
      expect([m![1], Number(m![2]), m![3] === 'true', Number(m![4])]).toEqual([p.name, p.cloudLimit, p.showAds, p.monthlyPriceJpy]);
    }
  });
});
