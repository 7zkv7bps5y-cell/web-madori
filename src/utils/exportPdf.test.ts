import { describe, expect, it } from 'vitest';
import { planPage } from './exportPdf';

describe('PDF のページ割り付け', () => {
  it('1/100 は実寸の 1/100 で描き、横向きを優先する', () => {
    const p = planPage({ w: 12000, h: 10000 }, 'a4', 100)!;
    expect(p.ratio).toBeCloseTo(0.01);
    expect(p.w).toBeCloseTo(120);
    expect(p.orientation).toBe('landscape');
  });
  it('横向きに入らなければ縦向き', () => {
    const p = planPage({ w: 15000, h: 25000 }, 'a4', 100)!;
    expect(p.orientation).toBe('portrait');
  });
  it('どちらの向きにも収まらなければ null', () => {
    expect(planPage({ w: 30000, h: 30000 }, 'a4', 100)).toBeNull();
    expect(planPage({ w: 30000, h: 25000 }, 'a3', 100)).not.toBeNull();
  });
  it('用紙に合わせる場合は余白内いっぱいに描く', () => {
    const p = planPage({ w: 20000, h: 10000 }, 'a4', 'fit')!;
    expect(p.orientation).toBe('landscape');
    expect(p.w).toBeCloseTo(277);
  });
});
