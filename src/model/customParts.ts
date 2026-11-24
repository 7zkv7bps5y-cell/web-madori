/**
 * カスタムパーツ（利用者が作る図形）の作成・図形の計算・パーツライブラリ。
 * 部屋・家具とは別のデータ（Project.customParts）として持つ。
 */
import { uid } from './project';
import type { CustomPart, CustomPartDesign, CustomShape } from './types';

export const CUSTOM_SHAPE_LABEL: Record<CustomShape, string> = {
  rect: '四角形',
  circle: '円',
  ellipse: '楕円',
  polygon: '多角形',
  freehand: '自由描画',
};

export const CUSTOM_PATTERN_LABEL = {
  none: 'なし',
  hatch: '斜線',
  cross: '格子（斜め）',
  dots: '水玉',
  grid: '方眼',
  wood: '板張り',
} as const;

export const CUSTOM_COLORS = ['#e8d6bb', '#d9e8d2', '#cfe3ee', '#f3d9d9', '#e6e1f2', '#f4ecc9', '#d8d4cc', '#ffffff', '#9b958a'];

export function defaultDesign(shape: CustomShape): CustomPartDesign {
  return {
    name: CUSTOM_SHAPE_LABEL[shape],
    shape,
    fill: '#d9e8d2',
    stroke: '#5b544a',
    strokeWidth: 20,
    opacity: 0.85,
    pattern: 'none',
    showName: true,
  };
}

/** 標準の大きさ (mm) */
export function defaultSize(shape: CustomShape): { w: number; h: number } {
  return shape === 'rect' ? { w: 1820, h: 910 } : shape === 'ellipse' ? { w: 1820, h: 1200 } : { w: 1200, h: 1200 };
}

export function createCustomPart(
  design: CustomPartDesign,
  at: { x: number; y: number; w: number; h: number },
  floorId: string,
  libraryId: string | null = null,
): CustomPart {
  return {
    ...structuredClone(design),
    id: uid('cp'),
    floorId,
    x: at.x,
    y: at.y,
    w: at.w,
    h: at.h,
    rotation: 0,
    libraryId,
  };
}

/** 形と見た目だけを取り出す（ライブラリへの保存用） */
export function designOf(p: CustomPart): CustomPartDesign {
  const d: CustomPartDesign = {
    name: p.name,
    shape: p.shape,
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    opacity: p.opacity,
    pattern: p.pattern,
    showName: p.showName,
  };
  if (p.points) d.points = p.points.map(([x, y]) => [x, y]);
  if (p.text) d.text = p.text;
  return d;
}

type Pt = { x: number; y: number };

/** 線を間引く（Ramer–Douglas–Peucker 法）。自由描画の点を減らしてデータを小さくする */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const [a, b] = [points[0], points[points.length - 1]];
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tolerance) return [a, b];
  return [...simplify(points.slice(0, idx + 1), tolerance).slice(0, -1), ...simplify(points.slice(idx), tolerance)];
}

/**
 * ワールド座標の点の列から、外接矩形（中心・幅・高さ）と正規化した頂点（-0.5〜0.5）を作る。
 * 点が少なすぎる・面積がない場合は null。
 */
export function shapeFromPoints(points: Pt[], minSize = 100): { x: number; y: number; w: number; h: number; points: [number, number][] } | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const w = Math.max(...xs) - x1;
  const h = Math.max(...ys) - y1;
  if (w < minSize || h < minSize) return null;
  const cx = x1 + w / 2;
  const cy = y1 + h / 2;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { x: cx, y: cy, w, h, points: points.map((p) => [r((p.x - cx) / w), r((p.y - cy) / h)]) };
}

/** 図形の外形（ローカル座標、中心 0,0、幅 w・高さ h） */
export function outlinePath(p: Pick<CustomPart, 'shape' | 'w' | 'h' | 'points'>): string {
  const { w, h } = p;
  if ((p.shape === 'polygon' || p.shape === 'freehand') && p.points && p.points.length >= 3) {
    return p.points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x * w} ${y * h}`).join(' ') + ' Z';
  }
  if (p.shape === 'circle' || p.shape === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    return `M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z`;
  }
  return `M ${-w / 2} ${-h / 2} H ${w / 2} V ${h / 2} H ${-w / 2} Z`;
}

// ---------------------------------------------------------------------------
// パーツライブラリ（保存したオリジナルパーツ）
// 現在はこのブラウザに保存する。配置したパーツは間取りデータに形ごと入るので、
// ライブラリがない端末・共有先でもそのまま表示・編集できる。
// 将来ユーザー間で共有できるよう、1 件ずつ独立した ID・形式バージョンを持たせる
// ---------------------------------------------------------------------------

export interface LibraryPart {
  id: string;
  version: 1;
  design: CustomPartDesign;
  /** 標準の大きさ (mm) */
  w: number;
  h: number;
  createdAt: string;
  updatedAt: string;
}

const LIB_KEY = 'web-madori:custom-parts:v1';
export const MAX_LIBRARY = 100;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadLibrary(store: Store | null = defaultStore()): LibraryPart[] {
  try {
    const raw = store?.getItem(LIB_KEY);
    const list = raw ? (JSON.parse(raw) as LibraryPart[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && l.version === 1 && l.design && l.w > 0 && l.h > 0) : [];
  } catch {
    return [];
  }
}

function writeLibrary(list: LibraryPart[], store: Store | null) {
  store?.setItem(LIB_KEY, JSON.stringify(list));
}

/** 配置済みのパーツをライブラリに保存（同じ名前でも別の項目として追加） */
export function addToLibrary(part: CustomPart, store: Store | null = defaultStore()): LibraryPart | null {
  const list = loadLibrary(store);
  if (list.length >= MAX_LIBRARY) return null;
  const now = new Date().toISOString();
  const item: LibraryPart = { id: uid('lib'), version: 1, design: designOf(part), w: part.w, h: part.h, createdAt: now, updatedAt: now };
  writeLibrary([item, ...list], store);
  return item;
}

export function removeFromLibrary(id: string, store: Store | null = defaultStore()) {
  writeLibrary(
    loadLibrary(store).filter((l) => l.id !== id),
    store,
  );
}

export function renameLibraryPart(id: string, name: string, store: Store | null = defaultStore()) {
  writeLibrary(
    loadLibrary(store).map((l) => (l.id === id ? { ...l, design: { ...l.design, name }, updatedAt: new Date().toISOString() } : l)),
    store,
  );
}
