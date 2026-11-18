import type { AreaUnit } from './types';

export const TSUBO_M2 = 3.305785;

export function areaM2(w: number, h: number): number {
  return (w * h) / 1_000_000;
}

export function formatArea(m2: number, unit: AreaUnit, tatamiArea = 1.62): string {
  switch (unit) {
    case 'tatami':
      return `${round1(m2 / tatamiArea)}帖`;
    case 'tsubo':
      return `${round1(m2 / TSUBO_M2)}坪`;
    case 'm2':
    default:
      return `${round2(m2)}㎡`;
  }
}

export function round1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}
export function round2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** mm を "3,640" のように表示 */
export function formatMm(v: number): string {
  return Math.round(v).toLocaleString('ja-JP');
}

export function snap(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}

/**
 * 畳数からグリッドに沿った横幅・縦幅を求める。
 * 面積が最も近く、縦横比が 2 以下で、なるべく正方形に近い組み合わせを選ぶ。
 */
export function sizeFromTatami(
  tatami: number,
  grid: number,
  tatamiArea = 1.62,
  preferWide = false,
): { w: number; h: number } {
  const target = tatami * tatamiArea * 1_000_000;
  let best = { w: grid, h: grid, score: Infinity };
  const maxN = Math.max(2, Math.ceil(Math.sqrt(target * 4) / grid) + 2);
  for (let a = 1; a <= maxN; a++) {
    for (let b = a; b <= maxN * 2; b++) {
      const w = a * grid;
      const h = b * grid;
      if (h / w > 2) continue;
      const areaErr = Math.abs(w * h - target) / target;
      const aspect = h / w;
      const score = areaErr * 10 + (aspect - 1) * 0.05;
      if (score < best.score) best = { w, h, score };
    }
  }
  return preferWide ? { w: best.h, h: best.w } : { w: best.w, h: best.h };
}

export function tatamiFromSize(w: number, h: number, tatamiArea = 1.62): number {
  return areaM2(w, h) / tatamiArea;
}
