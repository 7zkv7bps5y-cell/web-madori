import { furnitureAabb } from './collision';
import type { Furniture } from './types';

type Pt = { x: number; y: number };
export type FurnitureHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const FURNITURE_HANDLES: FurnitureHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const MIN_FURNITURE = 100;

function axes(rotation: number) {
  const r = (rotation * Math.PI) / 180;
  return { ux: { x: Math.cos(r), y: Math.sin(r) }, uy: { x: -Math.sin(r), y: Math.cos(r) } };
}

/** ハンドルのローカル位置（-1/0/1） */
export function handleSign(h: FurnitureHandle): { sx: number; sy: number } {
  return { sx: h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy: h.includes('s') ? 1 : h.includes('n') ? -1 : 0 };
}

export function handleWorld(f: Furniture, h: FurnitureHandle): Pt {
  const { ux, uy } = axes(f.rotation);
  const { sx, sy } = handleSign(h);
  return {
    x: f.x + ux.x * (sx * f.w) / 2 + uy.x * (sy * f.d) / 2,
    y: f.y + ux.y * (sx * f.w) / 2 + uy.y * (sy * f.d) / 2,
  };
}

/**
 * 家具を移動する。中心をグリッドにスナップし、
 * 90°単位の向きなら外形を壁の内側の面へ吸着させる（壁にぴったり付けやすくする）。
 */
export function snapFurnitureMove(
  f: Furniture,
  x: number,
  y: number,
  faces: { xs: number[]; ys: number[] },
  grid: number,
  threshold: number,
): Pt {
  let nx = Math.round(x / grid) * grid;
  let ny = Math.round(y / grid) * grid;
  if (Math.round(f.rotation) % 90 === 0) {
    const box = furnitureAabb({ ...f, x, y });
    const fit = (lo: number, hi: number, faceList: number[], fallback: number, center: number) => {
      let best = fallback;
      let bestD = threshold;
      for (const face of faceList) {
        for (const edge of [lo, hi]) {
          const d = Math.abs(face - edge);
          if (d < bestD) {
            bestD = d;
            best = center + (face - edge);
          }
        }
      }
      return best;
    };
    nx = fit(box.x, box.x + box.w, faces.xs, nx, x);
    ny = fit(box.y, box.y + box.h, faces.ys, ny, y);
  }
  return { x: nx, y: ny };
}

/** 回転した家具のリサイズ（反対側の辺・角を固定） */
export function resizeFurniture(orig: Furniture, h: FurnitureHandle, p: Pt, step: number): Pick<Furniture, 'x' | 'y' | 'w' | 'd'> {
  const { ux, uy } = axes(orig.rotation);
  const { sx, sy } = handleSign(h);
  const rel = { x: p.x - orig.x, y: p.y - orig.y };
  const lx = rel.x * ux.x + rel.y * ux.y;
  const ly = rel.x * uy.x + rel.y * uy.y;
  const snapS = (v: number) => Math.max(MIN_FURNITURE, Math.round(v / step) * step);
  // 固定側の辺からポインタまでの距離が新しい寸法
  const w = sx ? snapS(sx * lx + orig.w / 2) : orig.w;
  const d = sy ? snapS(sy * ly + orig.d / 2) : orig.d;
  const cx = (sx * (w - orig.w)) / 2;
  const cy = (sy * (d - orig.d)) / 2;
  return { x: orig.x + ux.x * cx + uy.x * cy, y: orig.y + ux.y * cx + uy.y * cy, w, d };
}

/** 回転ハンドル: 中心からポインタ方向の角度（上向き = 0°）。step 度単位でスナップ */
export function angleFromPointer(f: Pt, p: Pt, step: number): number {
  const deg = (Math.atan2(p.y - f.y, p.x - f.x) * 180) / Math.PI + 90;
  const snapped = Math.round(deg / step) * step;
  return ((snapped % 360) + 360) % 360;
}
