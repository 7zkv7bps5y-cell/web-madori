import { create } from 'zustand';
import { applyFlowFix, type FlowFix } from '../model/flowCheck';
import { openingDef, roomDef } from '../model/catalog';
import {
  clampOpeningToRoom,
  embeddedStairsOf,
  findAdjacentPlacement,
  findFreeSpotNear,
  isEmbeddedStairs,
  rehostOpening,
  roomConflicts,
  rotateOpeningCW,
  wallRooms,
  type WallHit,
} from '../model/geometry';
import {
  activeContent,
  addFloor,
  addPlan,
  createFurniture,
  createOpening,
  createProject,
  copyProject,
  createRoom,
  deleteFloor,
  deletePlan,
  MAX_FLOORS,
  MAX_PLANS,
  renamePlan,
  switchPlan,
  uid,
} from '../model/project';
import type {
  CustomPart,
  EditorMode,
  Furniture,
  PartInfo,
  Opening,
  OpeningType,
  Project,
  Rect,
  Room,
  RoomType,
  Selection,
  Side,
} from '../model/types';

export type Tool =
  | { kind: 'select' }
  | { kind: 'placeOpening'; type: OpeningType }
  /** カスタムパーツの多角形・自由描画 */
  | { kind: 'drawShape'; shape: 'polygon' | 'freehand' };

/** 共有リンクで開いた間取り（閲覧のみ） */
export interface ViewerState {
  name: string;
  /** 共有リンクの識別子 */
  token: string;
  updatedAt?: string;
}

interface Stash {
  project: Project;
  past: Project[];
  future: Project[];
}

export interface AddDialogState {
  /** null の場合は基準なし（最初の部屋） */
  baseId: string | null;
  dir: Side | null;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

const HISTORY_LIMIT = 100;

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection | null;
  tool: Tool;
  addDialog: AddDialogState | null;
  toast: Toast | null;
  /** ドラッグ中の一時状態の基準 */
  dragBase: Project | null;
  mode: EditorMode;
  /** 閲覧専用モード（共有リンク）。この間は編集を受け付けない */
  viewer: ViewerState | null;
  /** 閲覧中、自分の間取りと履歴を退避しておく */
  stash: Stash | null;
  enterViewer: (project: Project, meta: ViewerState) => void;
  exitViewer: () => void;
  /** 閲覧中の間取りを、このブラウザの自分の間取りとしてコピーする（元に戻すで前の間取りに戻せる） */
  copyViewerToLocal: (copy?: Project) => void;

  // 基本
  commit: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  beginDrag: () => void;
  dragUpdate: (fn: (p: Project) => Project) => void;
  endDrag: () => void;
  /** undoable = true なら「元に戻す」で読み込み前に戻せる */
  loadProject: (p: Project, undoable?: boolean) => void;
  newProject: () => void;
  setProjectName: (name: string) => void;
  setSettings: (patch: Partial<Project['settings']>) => void;

  // UI
  setMode: (m: EditorMode) => void;
  select: (s: Selection | null) => void;
  setTool: (t: Tool) => void;
  openAddDialog: (s: AddDialogState) => void;
  closeAddDialog: () => void;
  notify: (message: string, tone?: Toast['tone']) => void;

  // 部屋
  addRoomAt: (type: RoomType, rect: Rect) => boolean;
  addRoomAdjacent: (baseId: string, dir: Side, type: RoomType, w: number, h: number) => boolean;
  setRoomRect: (id: string, rect: Rect) => boolean;
  updateRoom: (id: string, patch: Partial<Omit<Room, 'id' | 'x' | 'y' | 'w' | 'h'>>) => void;
  setRoomType: (id: string, type: RoomType) => void;
  rotateRoom: (id: string) => boolean;
  duplicateRoom: (id: string) => boolean;
  deleteRoom: (id: string) => void;

  // 開口部
  addOpening: (type: OpeningType, hit: WallHit) => void;
  updateOpening: (id: string, patch: Partial<Omit<Opening, 'id'>>) => void;
  deleteOpening: (id: string) => void;

  // 家具
  addFurniture: (type: string, at: { x: number; y: number }) => void;

  // カスタムパーツ
  addCustomPart: (part: CustomPart) => void;
  updateCustomPart: (id: string, patch: Partial<Omit<CustomPart, 'id'>>) => void;
  deleteCustomPart: (id: string) => void;
  duplicateCustomPart: (id: string) => void;

  /** パーツの参考情報（画像・URL・メモ）。undefined で削除 */
  setPartInfo: (target: Selection, info: PartInfo | undefined) => void;
  updateFurniture: (id: string, patch: Partial<Omit<Furniture, 'id'>>) => void;
  rotateFurniture: (id: string, delta: number) => void;
  /** 生活動線チェックの改善提案を適用 */
  applyFlowFix: (fix: FlowFix) => void;
  duplicateFurniture: (id: string) => void;
  deleteFurniture: (id: string) => void;

  // 階
  /** 編集する階の切り替え（履歴には残さない） */
  setActiveFloor: (floorId: string) => void;
  addFloor: () => boolean;
  renameFloor: (floorId: string, name: string) => void;
  deleteFloor: (floorId: string) => void;

  // 間取り案（A案・B案…）
  addPlan: (duplicateCurrent: boolean) => boolean;
  switchPlan: (planId: string) => void;
  renamePlan: (planId: string, name: string) => void;
  deletePlan: (planId: string) => void;

  deleteSelection: () => void;
  duplicateSelection: () => void;
  rotateSelection: () => void;
}

export const normalizeAngle = (a: number) => ((Math.round(a) % 360) + 360) % 360;

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

/**
 * 部屋の中に置いた階段（リビング階段など）の縁には壁がないため、そこに付いていたドア・窓を外す。
 * 編集の確定時に行う（元に戻すで戻せる）。
 */
export function pruneStairsOpenings(p: Project): Project {
  const drop = new Set(p.rooms.filter((r) => r.type === 'stairs' && isEmbeddedStairs(r, p.rooms)).map((r) => r.id));
  if (drop.size === 0 || !p.openings.some((o) => drop.has(o.roomId))) return p;
  return { ...p, openings: p.openings.filter((o) => !drop.has(o.roomId)) };
}

/** 矩形を (cx, cy) を中心に時計回りに 90° 回し、(dx, dy) だけ動かす */
function rotateRectCW(r: Rect, cx: number, cy: number, dx: number, dy: number): Rect {
  const sx = r.x + r.w / 2;
  const sy = r.y + r.h / 2;
  const nx = cx - (sy - cy) + dx;
  const ny = cy + (sx - cx) + dy;
  return { x: nx - r.h / 2, y: ny - r.w / 2, w: r.h, h: r.w };
}

export function activeRooms(p: Project): Room[] {
  return p.rooms.filter((r) => r.floorId === p.settings.activeFloorId);
}

/** 部屋の寸法変更後、その部屋の開口部が辺からはみ出さないよう調整 */
function clampOpenings(p: Project, room: Rect & { id: string }): Opening[] {
  return p.openings.map((o) => (o.roomId === room.id ? clampOpeningToRoom(o, room) : o));
}

let toastSeq = 0;

export const useStore = create<State>((set, get) => ({
  project: createProject(),
  past: [],
  future: [],
  selection: null,
  tool: { kind: 'select' },
  addDialog: null,
  toast: null,
  dragBase: null,
  mode: 'plan',
  viewer: null,
  stash: null,

  enterViewer: (project, meta) => {
    const { viewer, stash } = get();
    const keep = viewer && stash ? stash : { project: get().project, past: get().past, future: get().future };
    set({ stash: keep, viewer: meta, project, past: [], future: [], selection: null, tool: { kind: 'select' }, mode: 'plan', dragBase: null });
  },
  exitViewer: () => {
    const { stash } = get();
    if (!stash) return set({ viewer: null });
    set({ ...stash, stash: null, viewer: null, selection: null, tool: { kind: 'select' } });
  },
  copyViewerToLocal: (given) => {
    const { stash, project } = get();
    if (!get().viewer) return;
    const copy = given ?? copyProject(project, `${project.projectName}のコピー`);
    set({
      project: copy,
      past: stash ? [...stash.past, stash.project].slice(-HISTORY_LIMIT) : [],
      future: [],
      stash: null,
      viewer: null,
      selection: null,
    });
  },

  commit: (fn) => {
    // 閲覧専用モードでは変更しない（共有リンクの間取りは編集できない）
    if (get().viewer) return;
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: touch(pruneStairsOpenings(next)), past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  },
  undo: () => {
    const { past, project, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selection: validSelection(prev, get().selection) });
  },
  redo: () => {
    const { past, project, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1), selection: validSelection(next, get().selection) });
  },
  beginDrag: () => {
    if (!get().viewer) set({ dragBase: get().project });
  },
  dragUpdate: (fn) => {
    if (get().viewer) return;
    const next = fn(get().project);
    if (next !== get().project) set({ project: next });
  },
  endDrag: () => {
    const { dragBase, project, past } = get();
    if (dragBase && dragBase !== project) {
      // dragBase の解除と確定を同時に行う（自動保存が確定後の状態を確実に拾うため）
      set({ past: [...past, dragBase].slice(-HISTORY_LIMIT), future: [], project: touch(pruneStairsOpenings(project)), dragBase: null });
    } else {
      set({ dragBase: null });
    }
  },
  loadProject: (p, undoable = true) => {
    // 閲覧中に別の間取りを開く場合は、先に自分の間取りへ戻してから読み込む
    if (get().viewer) get().exitViewer();
    set({
      project: p,
      past: undoable ? [...get().past, get().project].slice(-HISTORY_LIMIT) : [],
      future: [],
      selection: null,
      tool: { kind: 'select' },
    });
  },
  newProject: () => get().loadProject(createProject(), true),
  setProjectName: (name) => get().commit((p) => (p.projectName === name ? p : { ...p, projectName: name })),
  setSettings: (patch) => get().commit((p) => ({ ...p, settings: { ...p.settings, ...patch } })),

  setMode: (m) => set({ mode: m, selection: null, tool: { kind: 'select' } }),
  select: (s) => set({ selection: s }),
  setTool: (t) => set({ tool: t }),
  openAddDialog: (s) => set({ addDialog: s }),
  closeAddDialog: () => set({ addDialog: null }),
  notify: (message, tone = 'info') => set({ toast: { id: ++toastSeq, message, tone } }),

  addRoomAt: (type, rect) => {
    const { project } = get();
    if (roomConflicts(rect, type, activeRooms(project))) {
      get().notify(
        type === 'stairs'
          ? '他の部屋と重なるため追加できません（階段は、1 つの部屋の中に収まる位置か、部屋の外なら置けます）。'
          : '他の部屋と重なるため追加できません。',
        'error',
      );
      return false;
    }
    const room = createRoom(type, rect, project.settings.activeFloorId);
    get().commit((p) => ({ ...p, rooms: [...p.rooms, room] }));
    set({ selection: { kind: 'room', id: room.id } });
    return true;
  },

  addRoomAdjacent: (baseId, dir, type, w, h) => {
    const { project } = get();
    const base = project.rooms.find((r) => r.id === baseId);
    if (!base) return false;
    const rect = findAdjacentPlacement(base, dir, w, h, activeRooms(project), project.settings.gridSize);
    if (!rect) {
      get().notify('その方向には部屋を追加できるスペースがありません。', 'error');
      return false;
    }
    return get().addRoomAt(type, rect);
  },

  setRoomRect: (id, rect) => {
    const { project } = get();
    const room = project.rooms.find((r) => r.id === id);
    if (!room || roomConflicts(rect, room.type, activeRooms(project), [id])) return false;
    get().commit((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...rect } : r)),
      openings: clampOpenings(p, { id, ...rect }),
    }));
    return true;
  },

  updateRoom: (id, patch) =>
    get().commit((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

  setRoomType: (id, type) =>
    get().commit((p) => ({
      ...p,
      rooms: p.rooms.map((r) => {
        if (r.id !== id || r.type === type) return r;
        // 名前が標準名のままなら、新しい種類の名前に変える（ユーザーが付けた名前は維持）
        const isDefaultName = r.name === roomDef(r.type).label || r.name.trim() === '';
        return { ...r, type, name: isDefaultName ? roomDef(type).label : r.name };
      }),
    })),

  rotateRoom: (id) => {
    const { project } = get();
    const room = project.rooms.find((r) => r.id === id);
    if (!room) return false;
    const rooms = activeRooms(project);
    const grid = project.settings.gridSize;
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const w = room.h;
    const h = room.w;
    // 中心で回すのが基本。隣の部屋と重なる場合は、四隅のどれかを固定して回す（壁際の細長い階段・収納など）
    const candidates: Rect[] = [
      { x: Math.round((cx - w / 2) / grid) * grid, y: Math.round((cy - h / 2) / grid) * grid, w, h },
      { x: room.x, y: room.y, w, h },
      { x: room.x + room.w - w, y: room.y, w, h },
      { x: room.x, y: room.y + room.h - h, w, h },
      { x: room.x + room.w - w, y: room.y + room.h - h, w, h },
    ];
    // 部屋の中に置いた階段は、部屋と一緒に回す
    const inner = embeddedStairsOf(room, rooms);
    const exclude = [id, ...inner.map((r) => r.id)];
    const rect = candidates.find((c) => !roomConflicts(c, room.type, rooms, exclude));
    if (!rect) {
      get().notify('回転すると他の部屋と重なるため回転できません。', 'error');
      return false;
    }
    const dx = rect.x + rect.w / 2 - cx;
    const dy = rect.y + rect.h / 2 - cy;
    const moved = new Map(inner.map((r) => [r.id, rotateRectCW(r, cx, cy, dx, dy)]));
    const turn = (r: Room) => (((r.rotation + 90) % 360) as Room['rotation']);
    get().commit((p) => ({
      ...p,
      rooms: p.rooms.map((r) =>
        r.id === id ? { ...r, ...rect, rotation: turn(r) } : moved.has(r.id) ? { ...r, ...moved.get(r.id)!, rotation: turn(r) } : r,
      ),
      openings: p.openings.map((o) => {
        if (o.roomId === id) return rotateOpeningCW(o, room);
        const s = inner.find((r) => r.id === o.roomId);
        return s ? rotateOpeningCW(o, s) : o;
      }),
    }));
    return true;
  },

  duplicateRoom: (id) => {
    const { project } = get();
    const room = project.rooms.find((r) => r.id === id);
    if (!room) return false;
    const rect = findFreeSpotNear(room, activeRooms(project), project.settings.gridSize);
    if (!rect) {
      get().notify('複製を置くスペースが見つかりません。', 'error');
      return false;
    }
    const copy: Room = { ...room, ...rect, id: uid('room'), style: { ...room.style } };
    const ops = project.openings
      .filter((o) => o.roomId === id)
      .map((o) => ({ ...o, id: uid('op'), roomId: copy.id }));
    get().commit((p) => ({ ...p, rooms: [...p.rooms, copy], openings: [...p.openings, ...ops] }));
    set({ selection: { kind: 'room', id: copy.id } });
    return true;
  },

  deleteRoom: (id) => {
    get().commit((p) => {
      const room = p.rooms.find((r) => r.id === id);
      if (!room) return p;
      const rest = p.rooms.filter((r) => r.id !== id);
      const restOnFloor = rest.filter((r) => r.floorId === room.floorId);
      const openings: Opening[] = [];
      for (const o of p.openings) {
        if (o.roomId !== id) openings.push(o);
        else {
          // 共有壁上のドア・窓は隣の部屋へ引き継ぐ
          const moved = rehostOpening(o, room, wallRooms(restOnFloor));
          if (moved) openings.push(moved);
        }
      }
      return { ...p, rooms: rest, openings };
    });
    set({ selection: null });
  },

  addOpening: (type, hit) => {
    const { project } = get();
    const def = openingDef(type);
    if (hit.width < def.minWidth) {
      get().notify(`この壁は短すぎるため${def.label}を設置できません。`, 'error');
      return;
    }
    const o = createOpening(
      type,
      { roomId: hit.roomId, side: hit.side, offset: hit.offset, width: hit.width },
      project.settings.activeFloorId,
    );
    get().commit((p) => ({ ...p, openings: [...p.openings, o] }));
    set({ selection: { kind: 'opening', id: o.id } });
  },

  updateOpening: (id, patch) =>
    get().commit((p) => ({
      ...p,
      openings: p.openings.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o, ...patch };
        const room = p.rooms.find((r) => r.id === next.roomId);
        return room ? clampOpeningToRoom(next, room) : next;
      }),
    })),

  deleteOpening: (id) => {
    get().commit((p) => ({ ...p, openings: p.openings.filter((o) => o.id !== id) }));
    set({ selection: null });
  },

  addCustomPart: (part) => {
    get().commit((p) => ({ ...p, customParts: [...p.customParts, part] }));
    set({ selection: { kind: 'custom', id: part.id } });
  },
  updateCustomPart: (id, patch) =>
    get().commit((p) => ({ ...p, customParts: p.customParts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  deleteCustomPart: (id) => {
    get().commit((p) => ({ ...p, customParts: p.customParts.filter((c) => c.id !== id) }));
    set({ selection: null });
  },
  duplicateCustomPart: (id) => {
    const c = get().project.customParts.find((x) => x.id === id);
    if (!c) return;
    const copy: CustomPart = { ...structuredClone(c), id: uid('cp'), x: c.x + 300, y: c.y + 300 };
    get().commit((p) => ({ ...p, customParts: [...p.customParts, copy] }));
    set({ selection: { kind: 'custom', id: copy.id } });
  },
  setPartInfo: (target, info) =>
    get().commit((p) => {
      const apply = <T extends { id: string; info?: PartInfo }>(list: T[]): T[] =>
        list.map((x) => {
          if (x.id !== target.id) return x;
          const next = { ...x };
          if (info) next.info = info;
          else delete next.info;
          return next;
        });
      switch (target.kind) {
        case 'room':
          return { ...p, rooms: apply(p.rooms) };
        case 'opening':
          return { ...p, openings: apply(p.openings) };
        case 'furniture':
          return { ...p, furniture: apply(p.furniture) };
        case 'custom':
          return { ...p, customParts: apply(p.customParts) };
      }
    }),

  addFurniture: (type, at) => {
    const f = createFurniture(type, at, get().project.settings.activeFloorId);
    get().commit((p) => ({ ...p, furniture: [...p.furniture, f] }));
    set({ selection: { kind: 'furniture', id: f.id } });
  },
  updateFurniture: (id, patch) =>
    get().commit((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
  rotateFurniture: (id, delta) =>
    get().commit((p) => ({
      ...p,
      furniture: p.furniture.map((f) => (f.id === id ? { ...f, rotation: normalizeAngle(f.rotation + delta) } : f)),
    })),
  applyFlowFix: (fix) => get().commit((p) => applyFlowFix(p, fix)),
  duplicateFurniture: (id) => {
    const f = get().project.furniture.find((x) => x.id === id);
    if (!f) return;
    const copy: Furniture = { ...f, id: uid('fur'), x: f.x + 300, y: f.y + 300 };
    get().commit((p) => ({ ...p, furniture: [...p.furniture, copy] }));
    set({ selection: { kind: 'furniture', id: copy.id } });
  },
  deleteFurniture: (id) => {
    get().commit((p) => ({ ...p, furniture: p.furniture.filter((f) => f.id !== id) }));
    set({ selection: null });
  },

  setActiveFloor: (floorId) => {
    const { project } = get();
    if (project.settings.activeFloorId === floorId || !project.floors.some((f) => f.id === floorId)) return;
    set({ project: { ...project, settings: { ...project.settings, activeFloorId: floorId } }, selection: null, tool: { kind: 'select' } });
  },
  addFloor: () => {
    if (get().project.floors.length >= MAX_FLOORS) {
      get().notify(`階は ${MAX_FLOORS} 階までです。`, 'error');
      return false;
    }
    get().commit((p) => addFloor(p));
    set({ selection: null, tool: { kind: 'select' } });
    return true;
  },
  renameFloor: (floorId, name) =>
    get().commit((p) => ({ ...p, floors: p.floors.map((f) => (f.id === floorId && name.trim() ? { ...f, name: name.trim() } : f)) })),
  deleteFloor: (floorId) => {
    get().commit((p) => deleteFloor(p, floorId));
    set({ selection: null });
  },
  addPlan: (duplicateCurrent) => {
    const { project } = get();
    if (project.plans.length >= MAX_PLANS) {
      get().notify(`間取り案は ${MAX_PLANS} 案までです。`, 'error');
      return false;
    }
    get().commit((p) => addPlan(p, duplicateCurrent ? activeContent(p) : undefined));
    set({ selection: null, tool: { kind: 'select' } });
    return true;
  },
  switchPlan: (planId) => {
    // 閲覧モードでは履歴を残さず表示だけ切り替える（データは編集しない）
    if (get().viewer) set({ project: switchPlan(get().project, planId) });
    else get().commit((p) => switchPlan(p, planId));
    set({ selection: null, tool: { kind: 'select' } });
  },
  renamePlan: (planId, name) => get().commit((p) => renamePlan(p, planId, name.trim() || p.plans.find((e) => e.id === planId)?.name || '案')),
  deletePlan: (planId) => {
    get().commit((p) => deletePlan(p, planId));
    set({ selection: null });
  },

  deleteSelection: () => {
    const s = get().selection;
    if (!s) return;
    if (s.kind === 'room') get().deleteRoom(s.id);
    else if (s.kind === 'opening') get().deleteOpening(s.id);
    else if (s.kind === 'custom') get().deleteCustomPart(s.id);
    else get().deleteFurniture(s.id);
  },
  rotateSelection: () => {
    const s = get().selection;
    if (s?.kind === 'room') get().rotateRoom(s.id);
    else if (s?.kind === 'furniture') get().rotateFurniture(s.id, 90);
    else if (s?.kind === 'custom') {
      const c = get().project.customParts.find((x) => x.id === s.id);
      if (c) get().updateCustomPart(c.id, { rotation: normalizeAngle(c.rotation + 90) });
    }
  },

  duplicateSelection: () => {
    const s = get().selection;
    if (!s) return;
    if (s.kind === 'room') get().duplicateRoom(s.id);
    else if (s.kind === 'furniture') get().duplicateFurniture(s.id);
    else if (s.kind === 'custom') get().duplicateCustomPart(s.id);
    else if (s.kind === 'opening') {
      const o = get().project.openings.find((x) => x.id === s.id);
      const room = o && get().project.rooms.find((r) => r.id === o.roomId);
      if (!o || !room) return;
      const copy = clampOpeningToRoom({ ...o, id: uid('op'), offset: o.offset + o.width + 100 }, room);
      get().commit((p) => ({ ...p, openings: [...p.openings, copy] }));
      set({ selection: { kind: 'opening', id: copy.id } });
    }
  },
}));

function validSelection(p: Project, s: Selection | null): Selection | null {
  if (!s) return null;
  if (s.kind === 'room') return p.rooms.some((r) => r.id === s.id) ? s : null;
  if (s.kind === 'opening') return p.openings.some((o) => o.id === s.id) ? s : null;
  if (s.kind === 'custom') return p.customParts.some((c) => c.id === s.id) ? s : null;
  return p.furniture.some((f) => f.id === s.id) ? s : null;
}
