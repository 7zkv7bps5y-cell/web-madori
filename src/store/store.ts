import { create } from 'zustand';
import { applyFlowFix, type FlowFix } from '../model/flowCheck';
import { openingDef, roomDef } from '../model/catalog';
import {
  clampOpeningToRoom,
  findAdjacentPlacement,
  findFreeSpotNear,
  overlapsAny,
  rehostOpening,
  rotateOpeningCW,
  type WallHit,
} from '../model/geometry';
import {
  activeContent,
  addFloor,
  addPlan,
  createFurniture,
  createOpening,
  createProject,
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
  EditorMode,
  Furniture,
  Opening,
  OpeningType,
  Project,
  Rect,
  Room,
  RoomType,
  Selection,
  Side,
} from '../model/types';

export type Tool = { kind: 'select' } | { kind: 'placeOpening'; type: OpeningType };

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

  commit: (fn) => {
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: touch(next), past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
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
  beginDrag: () => set({ dragBase: get().project }),
  dragUpdate: (fn) => {
    const next = fn(get().project);
    if (next !== get().project) set({ project: next });
  },
  endDrag: () => {
    const { dragBase, project, past } = get();
    if (dragBase && dragBase !== project) {
      // dragBase の解除と確定を同時に行う（自動保存が確定後の状態を確実に拾うため）
      set({ past: [...past, dragBase].slice(-HISTORY_LIMIT), future: [], project: touch(project), dragBase: null });
    } else {
      set({ dragBase: null });
    }
  },
  loadProject: (p, undoable = true) =>
    set({
      project: p,
      past: undoable ? [...get().past, get().project].slice(-HISTORY_LIMIT) : [],
      future: [],
      selection: null,
      tool: { kind: 'select' },
    }),
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
    if (overlapsAny(rect, activeRooms(project))) {
      get().notify('他の部屋と重なるため追加できません。', 'error');
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
    if (overlapsAny(rect, activeRooms(project), [id])) return false;
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
    const grid = project.settings.gridSize;
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const rect: Rect = {
      x: Math.round((cx - room.h / 2) / grid) * grid,
      y: Math.round((cy - room.w / 2) / grid) * grid,
      w: room.h,
      h: room.w,
    };
    if (overlapsAny(rect, activeRooms(project), [id])) {
      get().notify('回転すると他の部屋と重なるため回転できません。', 'error');
      return false;
    }
    get().commit((p) => ({
      ...p,
      rooms: p.rooms.map((r) =>
        r.id === id ? { ...r, ...rect, rotation: (((r.rotation + 90) % 360) as Room['rotation']) } : r,
      ),
      openings: p.openings.map((o) => (o.roomId === id ? rotateOpeningCW(o, room) : o)),
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
          const moved = rehostOpening(o, room, restOnFloor);
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
    get().commit((p) => switchPlan(p, planId));
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
    else get().deleteFurniture(s.id);
  },
  rotateSelection: () => {
    const s = get().selection;
    if (s?.kind === 'room') get().rotateRoom(s.id);
    else if (s?.kind === 'furniture') get().rotateFurniture(s.id, 90);
  },

  duplicateSelection: () => {
    const s = get().selection;
    if (!s) return;
    if (s.kind === 'room') get().duplicateRoom(s.id);
    else if (s.kind === 'furniture') get().duplicateFurniture(s.id);
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
  return p.furniture.some((f) => f.id === s.id) ? s : null;
}
