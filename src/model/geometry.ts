import type { Connection, Opening, Rect, Room, Side, WallSegment } from './types';

export const EPS = 0.5;

const r = (v: number) => Math.round(v * 2) / 2;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - EPS &&
    b.x < a.x + a.w - EPS &&
    a.y < b.y + b.h - EPS &&
    b.y < a.y + a.h - EPS
  );
}

export function overlapsAny(rect: Rect, rooms: Room[], exclude: string[] = []): boolean {
  return rooms.some((o) => !exclude.includes(o.id) && rectsOverlap(rect, o));
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of rects) {
    x1 = Math.min(x1, o.x);
    y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.w);
    y2 = Math.max(y2, o.y + o.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export interface Edge {
  orientation: 'h' | 'v';
  pos: number;
  start: number;
  end: number;
}

export function edgeOf(rect: Rect, side: Side): Edge {
  switch (side) {
    case 'top':
      return { orientation: 'h', pos: rect.y, start: rect.x, end: rect.x + rect.w };
    case 'bottom':
      return { orientation: 'h', pos: rect.y + rect.h, start: rect.x, end: rect.x + rect.w };
    case 'left':
      return { orientation: 'v', pos: rect.x, start: rect.y, end: rect.y + rect.h };
    case 'right':
      return { orientation: 'v', pos: rect.x + rect.w, start: rect.y, end: rect.y + rect.h };
  }
}

export function edgeLength(rect: Rect, side: Side): number {
  return side === 'top' || side === 'bottom' ? rect.w : rect.h;
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** 部屋の内側に向かう法線の符号（h: y方向, v: x方向） */
export function inwardSign(side: Side): 1 | -1 {
  return side === 'top' || side === 'left' ? 1 : -1;
}

/**
 * 全部屋の辺から壁を算出する。
 * 同一直線上で重なる辺は 1 本の壁として統合されるため、共有壁が二重に描画されない。
 */
export function computeWalls(rooms: Room[], floorId: string): WallSegment[] {
  const result: WallSegment[] = [];
  for (const orientation of ['h', 'v'] as const) {
    const lines = new Map<number, { start: number; end: number; roomId: string; side: Side }[]>();
    for (const room of rooms) {
      const sides: Side[] = orientation === 'h' ? ['top', 'bottom'] : ['left', 'right'];
      for (const side of sides) {
        const e = edgeOf(room, side);
        const key = r(e.pos);
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key)!.push({ start: e.start, end: e.end, roomId: room.id, side });
      }
    }
    for (const [pos, edges] of lines) {
      const points = Array.from(new Set(edges.flatMap((e) => [r(e.start), r(e.end)]))).sort(
        (a, b) => a - b,
      );
      let current: WallSegment | null = null;
      let currentKey = '';
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (b - a < EPS) continue;
        const covering = edges
          .filter((e) => e.start <= a + EPS && e.end >= b - EPS)
          .map((e) => ({ roomId: e.roomId, side: e.side }))
          .sort((x, y) => (x.roomId < y.roomId ? -1 : 1));
        if (covering.length === 0) {
          if (current) result.push(current);
          current = null;
          currentKey = '';
          continue;
        }
        const key = covering.map((c) => `${c.roomId}:${c.side}`).join('|');
        if (current && key === currentKey && Math.abs(current.end - a) < EPS) {
          current.end = b;
        } else {
          if (current) result.push(current);
          const sideSet = new Set(covering.map((c) => c.side));
          const exterior =
            orientation === 'h'
              ? !(sideSet.has('top') && sideSet.has('bottom'))
              : !(sideSet.has('left') && sideSet.has('right'));
          current = { id: '', floorId, orientation, pos, start: a, end: b, rooms: covering, exterior };
          currentKey = key;
        }
      }
      if (current) result.push(current);
    }
  }
  for (const w of result) w.id = `${w.orientation}:${w.pos}:${w.start}:${w.end}`;
  return result;
}

/** 共有壁から部屋同士の隣接関係を求める */
export function computeConnections(walls: WallSegment[]): Connection[] {
  const map = new Map<string, Connection>();
  for (const w of walls) {
    if (w.exterior || w.rooms.length < 2) continue;
    for (let i = 0; i < w.rooms.length; i++) {
      for (let j = i + 1; j < w.rooms.length; j++) {
        const [a, b] = [w.rooms[i].roomId, w.rooms[j].roomId].sort();
        const k = `${a}|${b}`;
        const c = map.get(k) ?? { a, b, length: 0 };
        c.length += w.end - w.start;
        map.set(k, c);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * 既存の部屋 base の dir 側に w×h の部屋を置ける位置を探す。
 * まず base の辺に揃えた位置を試し、塞がっていれば辺に沿ってずらす。
 * 他の部屋は一切動かさない。置けなければ null。
 */
export function findAdjacentPlacement(
  base: Rect,
  dir: Side,
  w: number,
  h: number,
  rooms: Room[],
  grid: number,
): Rect | null {
  const horizontal = dir === 'left' || dir === 'right';
  const fixed =
    dir === 'right' ? base.x + base.w : dir === 'left' ? base.x - w : dir === 'bottom' ? base.y + base.h : base.y - h;
  const along0 = horizontal ? base.y : base.x;
  const baseLen = horizontal ? base.h : base.w;
  const size = horizontal ? h : w;
  // 候補: 始点揃え、終点揃え、グリッド刻みのスライド（必ず base と接する範囲）
  const candidates = new Set<number>([along0, along0 + baseLen - size]);
  const step = Math.max(grid, 1);
  for (let t = along0 - size + step; t < along0 + baseLen; t += step) candidates.add(t);
  const sorted = Array.from(candidates)
    .filter((t) => t + size > along0 + EPS && t < along0 + baseLen - EPS)
    .sort((a, b) => Math.abs(a - along0) - Math.abs(b - along0));
  for (const t of sorted) {
    const rect: Rect = horizontal ? { x: fixed, y: t, w, h } : { x: t, y: fixed, w, h };
    if (!overlapsAny(rect, rooms)) return rect;
  }
  return null;
}

/** 複製などで、元の位置の近くの空き場所を探す */
export function findFreeSpotNear(src: Rect, rooms: Room[], grid: number): Rect | null {
  for (const dir of ['right', 'bottom', 'left', 'top'] as Side[]) {
    const p = findAdjacentPlacement(src, dir, src.w, src.h, rooms, grid);
    if (p) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 開口部（ドア・窓）
// ---------------------------------------------------------------------------

export interface OpeningGeom {
  orientation: 'h' | 'v';
  pos: number;
  start: number;
  end: number;
  /** 紐づく部屋の内側方向の符号 */
  inward: 1 | -1;
}

export function openingGeom(o: Opening, room: Rect): OpeningGeom {
  const e = edgeOf(room, o.side);
  return {
    orientation: e.orientation,
    pos: e.pos,
    start: e.start + o.offset,
    end: e.start + o.offset + o.width,
    inward: inwardSign(o.side),
  };
}

export function clampOpeningToRoom<T extends Pick<Opening, 'offset' | 'width' | 'side'>>(o: T, room: Rect): T {
  const len = edgeLength(room, o.side);
  const width = Math.min(o.width, len);
  const offset = Math.min(Math.max(0, o.offset), len - width);
  return { ...o, width, offset };
}

export interface WallHit {
  roomId: string;
  side: Side;
  offset: number;
  width: number;
  distance: number;
}

/**
 * 点 p に最も近い部屋の辺を探し、開口部の配置位置を返す。
 * 壁のない場所（どの部屋の辺からも threshold 以上離れている）では null。
 */
export function nearestWall(
  p: { x: number; y: number },
  rooms: Room[],
  width: number,
  threshold: number,
  snapStep = 0,
): WallHit | null {
  let best: WallHit | null = null;
  for (const room of rooms) {
    for (const side of SIDES) {
      const e = edgeOf(room, side);
      const along = e.orientation === 'h' ? p.x : p.y;
      const perp = e.orientation === 'h' ? p.y : p.x;
      const clampedAlong = Math.min(Math.max(along, e.start), e.end);
      const dist = Math.hypot(perp - e.pos, along - clampedAlong);
      if (dist > threshold) continue;
      // 同じ距離なら点がある側の部屋を優先
      const inside = (perp - e.pos) * inwardSign(side) >= 0;
      const score = dist - (inside ? 0.01 : 0);
      if (best && score >= best.distance) continue;
      const len = e.end - e.start;
      const wdt = Math.min(width, len);
      let offset = along - e.start - wdt / 2;
      if (snapStep > 0) offset = Math.round(offset / snapStep) * snapStep;
      offset = Math.min(Math.max(0, offset), len - wdt);
      best = { roomId: room.id, side, offset, width: wdt, distance: score };
    }
  }
  return best;
}

/** 部屋の 90° 時計回り回転に伴う開口部の辺・位置の変換 */
export function rotateOpeningCW(o: Opening, oldRoom: Rect): Opening {
  const map: Record<Side, Side> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const len = edgeLength(oldRoom, o.side);
  const flip = o.side === 'right' || o.side === 'left';
  return {
    ...o,
    side: map[o.side],
    offset: flip ? len - o.offset - o.width : o.offset,
    hinge: flip ? (o.hinge === 'start' ? 'end' : 'start') : o.hinge,
  };
}

/**
 * 部屋を削除するとき、共有壁上の開口部を隣の部屋に付け替える。
 * 付け替え先がない開口部は null を返す（削除される）。
 */
export function rehostOpening(o: Opening, oldRoom: Rect, rooms: Room[]): Opening | null {
  const g = openingGeom(o, oldRoom);
  for (const room of rooms) {
    for (const side of SIDES) {
      const e = edgeOf(room, side);
      if (e.orientation !== g.orientation || Math.abs(e.pos - g.pos) > EPS) continue;
      if (e.start <= g.start + EPS && e.end >= g.end - EPS) {
        const opposite = inwardSign(side) === -g.inward;
        return {
          ...o,
          roomId: room.id,
          side,
          offset: g.start - e.start,
          // 開き方向は物理的に同じ向きを保つ
          swing: opposite ? (o.swing === 'in' ? 'out' : 'in') : o.swing,
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 移動・リサイズのスナップ
// ---------------------------------------------------------------------------

function snapAxis(
  start: number,
  size: number,
  targets: number[],
  grid: number,
  threshold: number,
): number {
  let best = Math.round(start / grid) * grid;
  let bestDist = threshold;
  for (const t of targets) {
    for (const cand of [t, t - size]) {
      const d = Math.abs(cand - start);
      if (d < bestDist) {
        bestDist = d;
        best = cand;
      }
    }
  }
  return best;
}

/** 移動先の位置を、他の部屋の辺（マグネット）またはグリッドへスナップする */
export function snapMove(
  rect: Rect,
  others: Room[],
  grid: number,
  threshold: number,
): Rect {
  const xs = others.flatMap((o) => [o.x, o.x + o.w]);
  const ys = others.flatMap((o) => [o.y, o.y + o.h]);
  return {
    ...rect,
    x: snapAxis(rect.x, rect.w, xs, grid, threshold),
    y: snapAxis(rect.y, rect.h, ys, grid, threshold),
  };
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function snapValue(v: number, targets: number[], grid: number, threshold: number): number {
  let best = Math.round(v / grid) * grid;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/** ハンドルのドラッグからリサイズ後の矩形を求める（最小サイズ・スナップ付き） */
export function resizeRect(
  orig: Rect,
  handle: ResizeHandle,
  p: { x: number; y: number },
  others: Room[],
  grid: number,
  threshold: number,
  minSize: number,
): Rect {
  const xs = others.flatMap((o) => [o.x, o.x + o.w]);
  const ys = others.flatMap((o) => [o.y, o.y + o.h]);
  let x1 = orig.x, y1 = orig.y, x2 = orig.x + orig.w, y2 = orig.y + orig.h;
  if (handle.includes('w')) x1 = Math.min(snapValue(p.x, xs, grid, threshold), x2 - minSize);
  if (handle.includes('e')) x2 = Math.max(snapValue(p.x, xs, grid, threshold), x1 + minSize);
  if (handle.includes('n')) y1 = Math.min(snapValue(p.y, ys, grid, threshold), y2 - minSize);
  if (handle.includes('s')) y2 = Math.max(snapValue(p.y, ys, grid, threshold), y1 + minSize);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * rect の位置から近い順にグリッド上の空き位置を探す（パレットからの追加・ドロップ用）。
 * 既存の部屋に接する位置を優先する。
 */
export function findFreeSpot(rect: Rect, rooms: Room[], grid: number, maxRing = 40): Rect | null {
  if (!overlapsAny(rect, rooms)) return rect;
  let best: { rect: Rect; d: number } | null = null;
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const cand = { ...rect, x: rect.x + i * grid, y: rect.y + j * grid };
        if (overlapsAny(cand, rooms)) continue;
        const d = Math.hypot(i, j);
        if (!best || d < best.d) best = { rect: cand, d };
      }
    }
    const found = best as { rect: Rect; d: number } | null;
    if (found) return found.rect;
  }
  return null;
}
