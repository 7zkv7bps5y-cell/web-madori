import { openingDef } from './catalog';
import { furnitureDef } from './furnitureCatalog';
import { computeWalls, EPS, openingGeom } from './geometry';
import type { Furniture, Project, Rect, Room, WallSegment } from './types';

type Vec = { x: number; y: number };

/** 回転した家具の四隅（時計回り: 左奥, 右奥, 右前, 左前） */
export function furnitureCorners(f: Pick<Furniture, 'x' | 'y' | 'w' | 'd' | 'rotation'>, inset = 0): Vec[] {
  const rad = (f.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const hw = Math.max(0, f.w / 2 - inset);
  const hd = Math.max(0, f.d / 2 - inset);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, ly]) => ({ x: f.x + lx * c - ly * s, y: f.y + lx * s + ly * c }));
}

export function furnitureAabb(f: Pick<Furniture, 'x' | 'y' | 'w' | 'd' | 'rotation'>): Rect {
  const pts = furnitureCorners(f);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function rectCorners(r: Rect): Vec[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** 凸多角形同士の分離軸判定（接しているだけなら false） */
export function polygonsIntersect(a: Vec[], b: Vec[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const ax = -(p2.y - p1.y);
      const ay = p2.x - p1.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) {
        const v = p.x * ax + p.y * ay;
        minA = Math.min(minA, v);
        maxA = Math.max(maxA, v);
      }
      for (const p of b) {
        const v = p.x * ax + p.y * ay;
        minB = Math.min(minB, v);
        maxB = Math.max(maxB, v);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

export function wallThicknessOf(w: WallSegment, p: Project): number {
  return w.exterior ? p.settings.exteriorWallThickness : p.settings.interiorWallThickness;
}

/**
 * 壁の実体（厚みを持つ矩形）。ドア・引き戸の開口部は壁がないため除く。
 * 窓の位置は腰壁があるものとして壁扱い。
 */
export function solidWallRects(p: Project, rooms: Room[], walls: WallSegment[]): Rect[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const gaps = p.openings
    .filter((o) => byId.has(o.roomId) && openingDef(o.type).kind !== 'window')
    .map((o) => openingGeom(o, byId.get(o.roomId)!));
  const out: Rect[] = [];
  for (const w of walls) {
    const t = wallThicknessOf(w, p);
    const cuts = gaps
      .filter((g) => g.orientation === w.orientation && Math.abs(g.pos - w.pos) < EPS)
      .map((g) => [g.start, g.end] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = w.start - t / 2;
    const end = w.end + t / 2;
    const pieces: [number, number][] = [];
    for (const [a, b] of cuts) {
      if (a > cursor) pieces.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (end > cursor) pieces.push([cursor, end]);
    for (const [a, b] of pieces) {
      out.push(
        w.orientation === 'h'
          ? { x: a, y: w.pos - t / 2, w: b - a, h: t }
          : { x: w.pos - t / 2, y: a, w: t, h: b - a },
      );
    }
  }
  return out;
}

export type FurnitureIssue =
  | { kind: 'overlap'; otherId: string }
  | { kind: 'wall' }
  | { kind: 'outside' };

/** 家具ごとの干渉（重なり・壁・部屋の外）を求める。配置は禁止せず警告表示に使う */
export function checkFurniture(p: Project): Map<string, FurnitureIssue[]> {
  const floorId = p.settings.activeFloorId;
  const rooms = p.rooms.filter((r) => r.floorId === floorId);
  const items = p.furniture.filter((f) => f.floorId === floorId);
  const walls = solidWallRects(p, rooms, computeWalls(rooms, floorId)).map(rectCorners);
  const polys = items.map((f) => furnitureCorners(f, 1));
  const result = new Map<string, FurnitureIssue[]>();
  items.forEach((f, i) => {
    const issues: FurnitureIssue[] = [];
    const mounted = !!furnitureDef(f.type).wallMounted;
    if (!rooms.some((r) => f.x > r.x && f.x < r.x + r.w && f.y > r.y && f.y < r.y + r.h)) {
      issues.push({ kind: 'outside' });
    }
    if (!mounted && walls.some((w) => polygonsIntersect(polys[i], w))) issues.push({ kind: 'wall' });
    if (!mounted) {
      items.forEach((g, j) => {
        if (i === j || furnitureDef(g.type).wallMounted) return;
        if (polygonsIntersect(polys[i], polys[j])) issues.push({ kind: 'overlap', otherId: g.id });
      });
    }
    if (issues.length) result.set(f.id, issues);
  });
  return result;
}

/** 家具をぴったり寄せるための壁の内側の面（x 座標群・y 座標群） */
export function wallFaces(p: Project, rooms: Room[]): { xs: number[]; ys: number[] } {
  const walls = computeWalls(rooms, p.settings.activeFloorId);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of walls) {
    const t = wallThicknessOf(w, p);
    (w.orientation === 'v' ? xs : ys).push(w.pos - t / 2, w.pos + t / 2);
  }
  return { xs, ys };
}
