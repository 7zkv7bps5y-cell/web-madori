/**
 * 生活動線チェック（目安）
 * - ドアの開閉範囲に家具がかかっていないか
 * - 扉・引き出し・使うスペース（家具の正面）に壁や家具がないか
 * - 家具と家具・壁のすき間が通路として狭くないか
 * いずれも配置を禁止するものではなく、確認と改善の提案のために使う。
 */
import { openingDef } from './catalog';
import { furnitureCorners, polygonsIntersect, solidWallRects } from './collision';
import { furnitureDef } from './furnitureCatalog';
import { computeWalls, openingGeom } from './geometry';
import type { Furniture, Opening, Project, Rect, Room } from './types';

export type Vec = { x: number; y: number };

/** 通路として確認するすき間の範囲（mm）。これ未満は「すき間」、以上は十分とみなす */
export const PASSAGE_MIN = 300;
export const PASSAGE_OK = 600;

export type FlowFix =
  | { kind: 'flipSwing'; openingId: string }
  | { kind: 'flipHinge'; openingId: string };

export interface FlowIssue {
  id: string;
  kind: 'door' | 'front' | 'passage';
  /** warning = 使えない可能性が高い / info = 目安より狭い */
  severity: 'warning' | 'info';
  furnitureIds: string[];
  openingId?: string;
  message: string;
  suggestion: string;
  fixes: FlowFix[];
  /** 図に描くための形 */
  shape: { kind: 'polygon'; points: Vec[] } | { kind: 'gap'; a: Vec; b: Vec; distance: number };
}

// ---------------------------------------------------------------------------
// 形の計算
// ---------------------------------------------------------------------------

/** ドアが開閉するときに通る範囲（扇形を多角形で近似。凸形） */
export function doorSwingPolygon(o: Opening, room: Rect, steps = 12): Vec[] {
  const g = openingGeom(o, room);
  const W = g.end - g.start;
  const uh = o.hinge === 'start' ? g.start : g.end;
  const dirU = o.hinge === 'start' ? 1 : -1;
  const s = o.swing === 'in' ? 1 : -1;
  const toWorld = (u: number, v: number): Vec =>
    g.orientation === 'h' ? { x: u, y: g.pos + v * g.inward } : { x: g.pos + v * g.inward, y: u };
  const pts: Vec[] = [toWorld(uh, 0)];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * (Math.PI / 2);
    pts.push(toWorld(uh + dirU * W * Math.sin(th), s * W * Math.cos(th)));
  }
  return pts;
}

/** 家具の正面に必要な空き（正面側の長方形） */
export function frontZone(f: Furniture): Vec[] | null {
  const front = furnitureDef(f.type).front;
  if (!front) return null;
  const r = (f.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const hw = f.w / 2;
  const y0 = f.d / 2;
  const y1 = f.d / 2 + front.depth;
  return [
    [-hw, y0],
    [hw, y0],
    [hw, y1],
    [-hw, y1],
  ].map(([lx, ly]) => ({ x: f.x + lx * c - ly * sn, y: f.y + lx * sn + ly * c }));
}

function rectPoly(r: Rect): Vec[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** 多角形を少し内側に縮める（接しているだけのものを干渉扱いしないため） */
function shrink(poly: Vec[], by: number): Vec[] {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  return poly.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dx / len) * by, y: p.y - (dy / len) * by };
  });
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** 交差していない凸多角形同士の最短距離と、その 2 点 */
export function polygonDistance(a: Vec[], b: Vec[]): { distance: number; a: Vec; b: Vec } {
  let best = { distance: Infinity, a: a[0], b: b[0] };
  const scan = (P: Vec[], Q: Vec[], flip: boolean) => {
    for (const p of P) {
      for (let i = 0; i < Q.length; i++) {
        const q = closestOnSegment(p, Q[i], Q[(i + 1) % Q.length]);
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < best.distance) best = flip ? { distance: d, a: q, b: p } : { distance: d, a: p, b: q };
      }
    }
  };
  scan(a, b, false);
  scan(b, a, true);
  return best;
}

function roomOf(rooms: Room[], p: Vec): Room | undefined {
  return rooms.find((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h);
}

const cm = (mm: number) => `${Math.round(mm / 10)}cm`;

// ---------------------------------------------------------------------------
// チェック本体
// ---------------------------------------------------------------------------

function doorConflicts(o: Opening, room: Room, items: { f: Furniture; poly: Vec[] }[]): Furniture[] {
  const sector = shrink(doorSwingPolygon(o, room), 2);
  return items.filter(({ poly }) => polygonsIntersect(sector, poly)).map(({ f }) => f);
}

export function checkFlow(p: Project): FlowIssue[] {
  const floorId = p.settings.activeFloorId;
  const rooms = p.rooms.filter((r) => r.floorId === floorId);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const floor = p.furniture.filter((f) => f.floorId === floorId && !furnitureDef(f.type).wallMounted);
  // poly: 接触を干渉としないよう 1mm 縮めた形 / raw: 距離の計測用の実寸の形
  const items = floor.map((f) => ({ f, poly: furnitureCorners(f, 1), raw: furnitureCorners(f) }));
  const walls = solidWallRects(p, rooms, computeWalls(rooms, floorId)).map(rectPoly);
  const issues: FlowIssue[] = [];

  // 1) ドアの開閉範囲
  for (const o of p.openings) {
    if (o.floorId !== floorId || openingDef(o.type).kind !== 'door') continue;
    const room = roomById.get(o.roomId);
    if (!room) continue;
    const hits = doorConflicts(o, room, items);
    if (hits.length === 0) continue;
    // 開き方を変えれば解決するか試す
    const fixes: FlowFix[] = [];
    const alt = (patch: Partial<Opening>) => doorConflicts({ ...o, ...patch }, room, items).length === 0;
    if (alt({ swing: o.swing === 'in' ? 'out' : 'in' })) fixes.push({ kind: 'flipSwing', openingId: o.id });
    if (alt({ hinge: o.hinge === 'start' ? 'end' : 'start' })) fixes.push({ kind: 'flipHinge', openingId: o.id });
    const label = openingDef(o.type).label;
    const names = hits.map((f) => `「${f.name}」`).join('');
    issues.push({
      id: `door:${o.id}`,
      kind: 'door',
      severity: 'warning',
      furnitureIds: hits.map((f) => f.id),
      openingId: o.id,
      message: `${room.name}の${label}の開閉範囲に${names}がかかっています`,
      suggestion: fixes.length
        ? 'ドアの開き方を変えると解決できます。'
        : `家具をドアが開く範囲（半径${cm(o.width)}）の外へ動かしましょう。引き戸にする方法もあります。`,
      fixes,
      shape: { kind: 'polygon', points: doorSwingPolygon(o, room) },
    });
  }

  // 2) 扉・引き出し・使うスペース
  for (const { f } of items) {
    const zone = frontZone(f);
    if (!zone) continue;
    const z = shrink(zone, 2);
    const blockers = items.filter((it) => it.f.id !== f.id && polygonsIntersect(z, it.poly)).map((it) => it.f);
    const wallHit = walls.some((w) => polygonsIntersect(z, w));
    if (!wallHit && blockers.length === 0) continue;
    const front = furnitureDef(f.type).front!;
    const what = front.reason === 'door' ? '扉を開ける' : front.reason === 'drawer' ? '引き出しを開ける' : '使うときに立つ・座る';
    const by = [wallHit ? '壁' : '', ...blockers.map((b) => `「${b.name}」`)].filter(Boolean).join('と');
    issues.push({
      id: `front:${f.id}`,
      kind: 'front',
      severity: 'warning',
      furnitureIds: [f.id, ...blockers.map((b) => b.id)],
      message: `「${f.name}」の前（${what}スペース）を${by}がふさいでいます`,
      suggestion: `正面に${cm(front.depth)}ほどの空きがあると使いやすくなります。向きを変えるか、前のものを動かしましょう。`,
      fixes: [],
      shape: { kind: 'polygon', points: zone },
    });
  }

  // 3) 通路幅（同じ部屋の中の家具同士・家具と壁）
  const checkable = items.filter(({ f }) => !furnitureDef(f.type).noPassageCheck);
  const rooms0 = checkable.map(({ f }) => roomOf(rooms, f));
  const seenPairs = new Set<string>();
  checkable.forEach(({ f, poly, raw }, i) => {
    const room = rooms0[i];
    if (!room) return;
    for (let j = i + 1; j < checkable.length; j++) {
      if (rooms0[j]?.id !== room.id) continue;
      const other = checkable[j];
      if (polygonsIntersect(poly, other.poly)) continue;
      const d = polygonDistance(raw, other.raw);
      if (d.distance >= PASSAGE_MIN && d.distance < PASSAGE_OK) {
        const key = [f.id, other.f.id].sort().join('|');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        issues.push({
          id: `gap:${key}`,
          kind: 'passage',
          severity: 'info',
          furnitureIds: [f.id, other.f.id],
          message: `「${f.name}」と「${other.f.name}」の間が${cm(d.distance)}です`,
          suggestion: `人が通るなら${cm(PASSAGE_OK)}以上あけると通りやすくなります（通らない場所なら問題ありません）。`,
          fixes: [],
          shape: { kind: 'gap', a: d.a, b: d.b, distance: d.distance },
        });
      }
    }
    // 壁とのすき間（その部屋の内側の壁面まで）
    const t = p.settings.interiorWallThickness / 2;
    const faces: [Vec, Vec][] = [
      [{ x: room.x + t, y: room.y + t }, { x: room.x + room.w - t, y: room.y + t }],
      [{ x: room.x + room.w - t, y: room.y + t }, { x: room.x + room.w - t, y: room.y + room.h - t }],
      [{ x: room.x + t, y: room.y + room.h - t }, { x: room.x + room.w - t, y: room.y + room.h - t }],
      [{ x: room.x + t, y: room.y + t }, { x: room.x + t, y: room.y + room.h - t }],
    ];
    let best: { distance: number; a: Vec; b: Vec } | null = null;
    for (const face of faces) {
      const d = polygonDistance(raw, face);
      if (d.distance >= PASSAGE_MIN && d.distance < PASSAGE_OK && (!best || d.distance < best.distance)) best = d;
    }
    if (best) {
      issues.push({
        id: `wallgap:${f.id}`,
        kind: 'passage',
        severity: 'info',
        furnitureIds: [f.id],
        message: `「${f.name}」と壁の間が${cm(best.distance)}です`,
        suggestion: `通路にするなら${cm(PASSAGE_OK)}以上、使わないなら壁に寄せると部屋を広く使えます。`,
        fixes: [],
        shape: { kind: 'gap', a: best.a, b: best.b, distance: best.distance },
      });
    }
  });

  return issues;
}

export function applyFlowFix(p: Project, fix: FlowFix): Project {
  return {
    ...p,
    openings: p.openings.map((o) => {
      if (o.id !== fix.openingId) return o;
      return fix.kind === 'flipSwing'
        ? { ...o, swing: o.swing === 'in' ? 'out' : 'in' }
        : { ...o, hinge: o.hinge === 'start' ? 'end' : 'start' };
    }),
  };
}

export const FIX_LABEL: Record<FlowFix['kind'], string> = {
  flipSwing: 'ドアの開く向きを反転',
  flipHinge: 'ドアの吊元を反転',
};
