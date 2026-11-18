import { z } from 'zod';
import { roomDef } from './catalog';
import { computeConnections, computeWalls } from './geometry';
import {
  FLOOR_PATTERNS,
  OPENING_TYPES,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  ROOM_TYPES,
  type Opening,
  type OpeningType,
  type Project,
  type Rect,
  type Room,
  type RoomType,
} from './types';
import { openingDef } from './catalog';

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export function createProject(name = '無題の間取り'): Project {
  const floorId = uid('floor');
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    projectId: uid('prj'),
    projectName: name,
    floors: [{ id: floorId, name: '1階', level: 1, height: 2400 }],
    rooms: [],
    openings: [],
    furniture: [],
    settings: {
      gridSize: 455,
      majorGridSize: 910,
      areaUnit: 'tatami',
      tatamiArea: 1.62,
      exteriorWallThickness: 150,
      interiorWallThickness: 100,
      activeFloorId: floorId,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createRoom(type: RoomType, rect: Rect, floorId: string): Room {
  return {
    id: uid('room'),
    floorId,
    type,
    name: roomDef(type).label,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    shape: 'rect',
    style: { fill: null, floor: 'auto', showFixtures: true, showLabel: true, showArea: true },
  };
}

export function createOpening(
  type: OpeningType,
  at: Pick<Opening, 'roomId' | 'side' | 'offset' | 'width'>,
  floorId: string,
): Opening {
  return {
    id: uid('op'),
    floorId,
    type,
    hinge: 'start',
    swing: openingDef(type).kind === 'window' ? 'out' : 'in',
    ...at,
  };
}

// ---------------------------------------------------------------------------
// 検証スキーマ（ファイル読み込み・貼り付け時に使用）
// ---------------------------------------------------------------------------

const num = z.number().finite();
const mm = num.min(-1_000_000).max(1_000_000);
const size = num.positive().max(1_000_000);
const id = z.string().min(1).max(64);
const text = z.string().max(200);

const roomSchema = z.object({
  id,
  floorId: id,
  type: z.enum(ROOM_TYPES),
  name: text,
  x: mm,
  y: mm,
  w: size,
  h: size,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  shape: z.literal('rect').default('rect'),
  style: z.object({
    fill: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    floor: z.enum(FLOOR_PATTERNS),
    showFixtures: z.boolean(),
    showLabel: z.boolean(),
    showArea: z.boolean(),
  }),
});

const openingSchema = z.object({
  id,
  floorId: id,
  type: z.enum(OPENING_TYPES),
  roomId: id,
  side: z.enum(['top', 'right', 'bottom', 'left']),
  offset: num.min(0).max(1_000_000),
  width: size,
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['in', 'out']),
});

const furnitureSchema = z.object({
  id,
  floorId: id,
  type: z.string().max(64),
  name: text,
  x: mm,
  y: mm,
  w: size,
  d: size,
  rotation: num,
});

export const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(PROJECT_VERSION),
  projectId: id,
  projectName: text,
  floors: z
    .array(z.object({ id, name: text, level: num, height: size }))
    .min(1)
    .max(10),
  rooms: z.array(roomSchema).max(2000),
  openings: z.array(openingSchema).max(5000),
  furniture: z.array(furnitureSchema).max(5000),
  settings: z.object({
    gridSize: num.min(10).max(2000),
    majorGridSize: num.min(10).max(10000),
    areaUnit: z.enum(['tatami', 'm2', 'tsubo']),
    tatamiArea: num.min(1).max(2),
    exteriorWallThickness: num.min(10).max(1000),
    interiorWallThickness: num.min(10).max(1000),
    activeFloorId: id,
  }),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
});

/** 読み込み可能な最大サイズ（文字数） */
export const MAX_PROJECT_TEXT = 5_000_000;

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

export function parseProject(textData: string): ParseResult {
  if (textData.length > MAX_PROJECT_TEXT) {
    return { ok: false, error: 'データが大きすぎます（5MB まで）。' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(textData);
  } catch {
    return { ok: false, error: '間取りデータ（JSON）として読み取れませんでした。' };
  }
  const res = projectSchema.safeParse(raw);
  if (!res.success) {
    const issue = res.error.issues[0];
    const where = issue?.path.join('.') || 'データ';
    return { ok: false, error: `間取りデータの形式が正しくありません（${where}: ${issue?.message}）。` };
  }
  const p = res.data as Project;
  // 参照整合性: 存在しない部屋・フロアを参照する要素を取り除く
  const floorIds = new Set(p.floors.map((f) => f.id));
  const rooms = p.rooms.filter((r) => floorIds.has(r.floorId));
  const roomIds = new Set(rooms.map((r) => r.id));
  const openings = p.openings.filter((o) => roomIds.has(o.roomId));
  const furniture = p.furniture.filter((f) => floorIds.has(f.floorId));
  const settings = floorIds.has(p.settings.activeFloorId)
    ? p.settings
    : { ...p.settings, activeFloorId: p.floors[0].id };
  return { ok: true, project: { ...p, rooms, openings, furniture, settings } };
}

/**
 * 保存用 JSON を生成する。
 * walls / connections は部屋から算出される派生データで、外部ツール（3D化など）向けに出力する。
 * 読み込み時は無視され、部屋データから再計算される。
 */
export function serializeProject(p: Project, pretty = true): string {
  const derived = p.floors.map((f) => {
    const walls = computeWalls(
      p.rooms.filter((r) => r.floorId === f.id),
      f.id,
    );
    return { floorId: f.id, walls, connections: computeConnections(walls) };
  });
  const out = { ...p, updatedAt: new Date().toISOString(), derived };
  return JSON.stringify(out, null, pretty ? 2 : 0);
}

export const PROJECT_EXTENSION = '.floorplan';
