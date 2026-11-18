import { z } from 'zod';
import { openingDef, roomDef } from './catalog';
import { furnitureDef } from './furnitureCatalog';
import { computeConnections, computeWalls } from './geometry';
import {
  FLOOR_PATTERNS,
  OPENING_TYPES,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  ROOM_TYPES,
  type Furniture,
  type Opening,
  type OpeningType,
  type PlanContent,
  type PlanEntry,
  type Project,
  type Rect,
  type Room,
  type RoomType,
} from './types';

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export const MAX_PLANS = 10;

/** A案, B案, … の次の名前 */
export function nextPlanName(plans: { name: string }[]): string {
  for (let i = 0; i < 26; i++) {
    const name = `${String.fromCharCode(65 + i)}案`;
    if (!plans.some((p) => p.name === name)) return name;
  }
  return `案${plans.length + 1}`;
}

export function createProject(name = '無題の間取り'): Project {
  const floorId = uid('floor');
  const now = new Date().toISOString();
  const planId = uid('plan');
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    projectId: uid('prj'),
    projectName: name,
    floors: [{ id: floorId, name: '1階', level: 1, height: 2400 }],
    rooms: [],
    openings: [],
    furniture: [],
    activePlanId: planId,
    plans: [{ id: planId, name: 'A案', createdAt: now, updatedAt: now, content: null }],
    settings: {
      gridSize: 455,
      majorGridSize: 910,
      areaUnit: 'tatami',
      tatamiArea: 1.62,
      exteriorWallThickness: 150,
      interiorWallThickness: 100,
      furnitureGrid: 50,
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

export function createFurniture(type: string, at: { x: number; y: number }, floorId: string): Furniture {
  const def = furnitureDef(type);
  return {
    id: uid('fur'),
    floorId,
    type,
    name: def.label,
    x: at.x,
    y: at.y,
    w: def.w,
    d: def.d,
    height: def.height,
    rotation: 0,
    productId: null,
  };
}

// ---------------------------------------------------------------------------
// 間取り案（複数案）の操作
// ---------------------------------------------------------------------------

export function activeContent(p: Project): PlanContent {
  return {
    floors: p.floors,
    rooms: p.rooms,
    openings: p.openings,
    furniture: p.furniture,
    activeFloorId: p.settings.activeFloorId,
  };
}

/** 全案の中身（編集中の案はプロジェクト直下から取得） */
export function planContents(p: Project): { entry: PlanEntry; content: PlanContent }[] {
  return p.plans.map((entry) => ({
    entry,
    content: entry.id === p.activePlanId || !entry.content ? activeContent(p) : entry.content,
  }));
}

function withContent(p: Project, c: PlanContent): Project {
  return {
    ...p,
    floors: c.floors,
    rooms: c.rooms,
    openings: c.openings,
    furniture: c.furniture,
    settings: { ...p.settings, activeFloorId: c.activeFloorId },
  };
}

/** 指定した案を編集中としたプロジェクト（比較表示・画像出力用。元データは変更しない） */
export function materializePlan(p: Project, planId: string): Project {
  if (planId === p.activePlanId) return p;
  const entry = p.plans.find((e) => e.id === planId);
  if (!entry?.content) return p;
  return { ...withContent(p, entry.content), activePlanId: planId };
}

/** 編集中の案を切り替える */
export function switchPlan(p: Project, planId: string): Project {
  if (planId === p.activePlanId) return p;
  const target = p.plans.find((e) => e.id === planId);
  if (!target?.content) return p;
  const now = new Date().toISOString();
  const plans = p.plans.map((e) => {
    if (e.id === p.activePlanId) return { ...e, content: activeContent(p), updatedAt: now };
    if (e.id === planId) return { ...e, content: null };
    return e;
  });
  return { ...withContent(p, target.content), activePlanId: planId, plans };
}

/** ID を振り直した複製（案の複製・公開間取りの複製などで使う） */
export function cloneContent(c: PlanContent): PlanContent {
  const floorMap = new Map(c.floors.map((f) => [f.id, uid('floor')]));
  const roomMap = new Map(c.rooms.map((r) => [r.id, uid('room')]));
  const fl = (id: string) => floorMap.get(id) ?? id;
  return {
    floors: c.floors.map((f) => ({ ...f, id: fl(f.id) })),
    rooms: c.rooms.map((r) => ({ ...r, id: roomMap.get(r.id)!, floorId: fl(r.floorId), style: { ...r.style } })),
    openings: c.openings.map((o) => ({ ...o, id: uid('op'), floorId: fl(o.floorId), roomId: roomMap.get(o.roomId) ?? o.roomId })),
    furniture: c.furniture.map((f) => ({ ...f, id: uid('fur'), floorId: fl(f.floorId) })),
    activeFloorId: fl(c.activeFloorId),
  };
}

export function emptyContent(): PlanContent {
  const floorId = uid('floor');
  return { floors: [{ id: floorId, name: '1階', level: 1, height: 2400 }], rooms: [], openings: [], furniture: [], activeFloorId: floorId };
}

/** 案を追加して編集中にする。from を省略すると空の案 */
export function addPlan(p: Project, from?: PlanContent, name?: string): Project {
  if (p.plans.length >= MAX_PLANS) return p;
  const now = new Date().toISOString();
  const id = uid('plan');
  const content = from ? cloneContent(from) : emptyContent();
  const entry: PlanEntry = { id, name: name ?? nextPlanName(p.plans), createdAt: now, updatedAt: now, content };
  return switchPlan({ ...p, plans: [...p.plans, entry] }, id);
}

export function deletePlan(p: Project, planId: string): Project {
  if (p.plans.length <= 1) return p;
  let next = p;
  if (planId === p.activePlanId) {
    const other = p.plans.find((e) => e.id !== planId)!;
    next = switchPlan(p, other.id);
  }
  return { ...next, plans: next.plans.filter((e) => e.id !== planId) };
}

export function renamePlan(p: Project, planId: string, name: string): Project {
  return { ...p, plans: p.plans.map((e) => (e.id === planId ? { ...e, name } : e)) };
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
  height: size.default(700),
  rotation: num.min(-3600).max(3600),
  productId: z.string().max(128).nullable().default(null),
});

const floorSchema = z.object({ id, name: text, level: num, height: size });

const contentShape = {
  floors: z.array(floorSchema).min(1).max(10),
  rooms: z.array(roomSchema).max(2000),
  openings: z.array(openingSchema).max(5000),
  furniture: z.array(furnitureSchema).max(5000),
};

const settingsSchema = z.object({
  gridSize: num.min(10).max(2000),
  majorGridSize: num.min(10).max(10000),
  areaUnit: z.enum(['tatami', 'm2', 'tsubo']),
  tatamiArea: num.min(1).max(2),
  exteriorWallThickness: num.min(10).max(1000),
  interiorWallThickness: num.min(10).max(1000),
  furnitureGrid: num.min(1).max(1000).default(50),
  activeFloorId: id.optional(),
});

const v1Schema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(1),
  projectId: id,
  projectName: text,
  ...contentShape,
  settings: settingsSchema,
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
});

const planSchema = z.object({
  id,
  name: text,
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
  activeFloorId: id,
  ...contentShape,
});

const v2Schema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(2),
  projectId: id,
  projectName: text,
  settings: settingsSchema,
  activePlanId: id,
  plans: z.array(planSchema).min(1).max(MAX_PLANS),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
});

/** 読み込み可能な最大サイズ（文字数） */
export const MAX_PROJECT_TEXT = 5_000_000;

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

/** 参照整合性: 存在しない部屋・フロアを参照する要素を取り除く */
function sanitizeContent(c: PlanContent): PlanContent {
  const floorIds = new Set(c.floors.map((f) => f.id));
  const rooms = c.rooms.filter((r) => floorIds.has(r.floorId));
  const roomIds = new Set(rooms.map((r) => r.id));
  return {
    floors: c.floors,
    rooms,
    openings: c.openings.filter((o) => roomIds.has(o.roomId)),
    furniture: c.furniture.filter((f) => floorIds.has(f.floorId)),
    activeFloorId: floorIds.has(c.activeFloorId) ? c.activeFloorId : c.floors[0].id,
  };
}

function issueText(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue?.path.join('.') || 'データ';
  return `間取りデータの形式が正しくありません（${where}: ${issue?.message}）。`;
}

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
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === 1) {
    const res = v1Schema.safeParse(raw);
    if (!res.success) return { ok: false, error: issueText(res.error) };
    const d = res.data;
    const content = sanitizeContent({
      floors: d.floors,
      rooms: d.rooms as Room[],
      openings: d.openings,
      furniture: d.furniture,
      activeFloorId: d.settings.activeFloorId ?? d.floors[0].id,
    });
    const planId = uid('plan');
    const base: Project = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      projectId: d.projectId,
      projectName: d.projectName,
      ...content,
      activePlanId: planId,
      plans: [{ id: planId, name: 'A案', createdAt: d.createdAt, updatedAt: d.updatedAt, content: null }],
      settings: { ...d.settings, activeFloorId: content.activeFloorId },
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
    return { ok: true, project: withContent(base, content) };
  }
  const res = v2Schema.safeParse(raw);
  if (!res.success) {
    if (version !== 2) return { ok: false, error: '対応していない形式のデータです。' };
    return { ok: false, error: issueText(res.error) };
  }
  const d = res.data;
  const activeId = d.plans.some((pl) => pl.id === d.activePlanId) ? d.activePlanId : d.plans[0].id;
  const entries: PlanEntry[] = d.plans.map((pl) => {
    const content = sanitizeContent({
      floors: pl.floors,
      rooms: pl.rooms as Room[],
      openings: pl.openings,
      furniture: pl.furniture,
      activeFloorId: pl.activeFloorId,
    });
    return { id: pl.id, name: pl.name, createdAt: pl.createdAt, updatedAt: pl.updatedAt, content };
  });
  const active = entries.find((e) => e.id === activeId)!;
  const project: Project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    projectId: d.projectId,
    projectName: d.projectName,
    ...active.content!,
    activePlanId: activeId,
    plans: entries.map((e) => (e.id === activeId ? { ...e, content: null } : e)),
    settings: { ...d.settings, activeFloorId: active.content!.activeFloorId },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
  return { ok: true, project: withContent(project, active.content!) };
}

/**
 * 保存用 JSON（形式 v2）を生成する。全案の中身を plans[] に正規化して出力する。
 * derived（壁・接続）は部屋から算出される派生データで、外部ツール（3D化など）向け。読み込み時は無視される。
 */
export function serializeProject(p: Project, pretty = true): string {
  const now = new Date().toISOString();
  const plans = planContents(p).map(({ entry, content }) => ({
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.id === p.activePlanId ? now : entry.updatedAt,
    activeFloorId: content.activeFloorId,
    floors: content.floors,
    rooms: content.rooms,
    openings: content.openings,
    furniture: content.furniture,
    derived: content.floors.map((f) => {
      const walls = computeWalls(
        content.rooms.filter((r) => r.floorId === f.id),
        f.id,
      );
      return { floorId: f.id, walls, connections: computeConnections(walls) };
    }),
  }));
  const settings: Partial<Project['settings']> = { ...p.settings };
  delete settings.activeFloorId;
  const out = {
    format: p.format,
    version: PROJECT_VERSION,
    projectId: p.projectId,
    projectName: p.projectName,
    settings,
    activePlanId: p.activePlanId,
    plans,
    createdAt: p.createdAt,
    updatedAt: now,
  };
  return JSON.stringify(out, null, pretty ? 2 : 0);
}

export const PROJECT_EXTENSION = '.floorplan';
