import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openingDef, roomDef } from '../model/catalog';
import {
  boundsOf,
  clampOpeningToRoom,
  findAdjacentPlacement,
  findFreeSpot,
  nearestWall,
  openingGeom,
  overlapsAny,
  resizeRect,
  snapMove,
  type ResizeHandle,
  type WallHit,
} from '../model/geometry';
import { checkFurniture, furnitureCorners, wallFaces } from '../model/collision';
import { checkFlow, doorSwingPolygon, frontZone } from '../model/flowCheck';
import {
  angleFromPointer,
  FURNITURE_HANDLES,
  handleWorld,
  resizeFurniture,
  snapFurnitureMove,
  type FurnitureHandle,
} from '../model/furnitureGeom';
import type { Furniture, Project, Rect, RoomType, Side } from '../model/types';
import { formatMm } from '../model/units';
import { activeRooms, useStore } from '../store/store';
import { clampZoom, useView } from '../store/view';
import { floorBelow } from '../model/project';
import { FurnitureLayer } from './plan/FurnitureShape';
import { PlanDrawing, RoomLabels } from './plan/PlanDrawing';

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number; moved: boolean }
  | {
      kind: 'room';
      id: string;
      sx: number;
      sy: number;
      orig: Rect;
      /** 部屋と一緒に動かす家具（部屋の中にある家具）の元の位置 */
      carry: { id: string; x: number; y: number }[];
      moved: boolean;
      began: boolean;
    }
  | { kind: 'furniture'; id: string; sx: number; sy: number; orig: Furniture; moved: boolean; began: boolean }
  | { kind: 'fresize'; id: string; handle: FurnitureHandle; orig: Furniture; began: boolean }
  | { kind: 'frotate'; id: string; began: boolean }
  | { kind: 'resize'; id: string; handle: ResizeHandle; orig: Rect; began: boolean }
  | { kind: 'opening'; id: string; sx: number; sy: number; moved: boolean; began: boolean }
  | { kind: 'button'; baseId: string; dir: Side; sx: number; sy: number; moved: boolean }
  | { kind: 'place'; sx: number; sy: number; moved: boolean; panX: number; panY: number }
  | { kind: 'pinch'; dist: number; zoom: number; mx: number; my: number; panX: number; panY: number };

const ACCENT = '#1f7a63';
export const ROOM_DRAG_MIME = 'application/x-madori-room';
export const FURNITURE_DRAG_MIME = 'application/x-madori-furniture';

/** 画面中央に家具を置く（パレットからの追加用） */
export function addFurnitureNearCenter(type: string) {
  const { zoom, panX, panY, width, height } = useView.getState();
  const grid = useStore.getState().project.settings.furnitureGrid;
  const x = Math.round((width / 2 - panX) / zoom / grid) * grid;
  const y = Math.round((height / 2 - panY) / zoom / grid) * grid;
  useStore.getState().addFurniture(type, { x, y });
}

const HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

function handlePos(r: Rect, h: ResizeHandle) {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

function withRoomRect(p: Project, id: string, rect: Rect): Project {
  return {
    ...p,
    rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...rect } : r)),
    openings: p.openings.map((o) => (o.roomId === id ? clampOpeningToRoom(o, rect) : o)),
  };
}

/** 画面中央付近の空き位置に部屋を置く（パレットからの追加用） */
export function addRoomNearCenter(
  type: RoomType,
  opts: { w?: number; h?: number; nextToSelection?: boolean } = {},
) {
  const { project, addRoomAt, notify } = useStore.getState();
  const { zoom, panX, panY, width, height } = useView.getState();
  const def = { w: opts.w ?? roomDef(type).w, h: opts.h ?? roomDef(type).h };
  const grid = project.settings.gridSize;
  const cx = (width / 2 - panX) / zoom;
  const cy = (height / 2 - panY) / zoom;
  const rooms = activeRooms(project);
  const sel = useStore.getState().selection;
  // 部屋が選択されていれば、その隣に追加する
  if (opts.nextToSelection !== false && sel?.kind === 'room') {
    const base = rooms.find((r) => r.id === sel.id);
    if (base) {
      for (const dir of ['right', 'bottom', 'left', 'top'] as Side[]) {
        const rect = findAdjacentPlacement(base, dir, def.w, def.h, rooms, grid);
        if (rect) return addRoomAt(type, rect);
      }
    }
  }
  const start = {
    x: Math.round((cx - def.w / 2) / grid) * grid,
    y: Math.round((cy - def.h / 2) / grid) * grid,
    w: def.w,
    h: def.h,
  };
  const rect = findFreeSpot(start, rooms, grid);
  if (!rect) {
    notify('部屋を置く場所が見つかりませんでした。', 'error');
    return false;
  }
  return addRoomAt(type, rect);
}

export function Canvas({ touchUi }: { touchUi: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const { zoom, panX, panY, width, height, fitSeq, showDims, showFlow, showBelow, showRoomDims } = useView();
  const setView = useView((s) => s.set);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [ghost, setGhost] = useState<WallHit | null>(null);

  const floorId = project.settings.activeFloorId;
  const rooms = useMemo(() => activeRooms(project), [project]);
  const grid = project.settings.gridSize;

  // サイズ監視
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setView({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setView]);

  // 全体表示
  const fit = useCallback(() => {
    const { width: vw, height: vh } = useView.getState();
    const prj = useStore.getState().project;
    // 編集中の階が空なら、他の階（下の階）の範囲を表示
    const b = boundsOf(activeRooms(prj)) ?? boundsOf(prj.rooms);
    const margin = 1800;
    const box = b
      ? { x: b.x - margin, y: b.y - margin, w: b.w + margin * 2, h: b.h + margin * 2 }
      : { x: -4000, y: -3000, w: 12000, h: 9000 };
    const z = clampZoom(Math.min(vw / box.w, vh / box.h));
    setView({ zoom: z, panX: vw / 2 - (box.x + box.w / 2) * z, panY: vh / 2 - (box.y + box.h / 2) * z });
  }, [setView]);
  useEffect(() => {
    fit();
  }, [fitSeq, fit]);
  const sizedOnce = useRef(false);
  useEffect(() => {
    if (!sizedOnce.current && width > 0 && height > 0) {
      sizedOnce.current = true;
      fit();
    }
  }, [width, height, fit]);

  // ホイールズーム（passive: false が必要なためネイティブで登録）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      useView.getState().zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (tool.kind !== 'placeOpening') setGhost(null);
  }, [tool]);

  // 選択した部屋（追加直後など）が画面外にはみ出していれば、見える位置へスクロール
  const selRoomId = selection?.kind === 'room' ? selection.id : null;
  useEffect(() => {
    if (!selRoomId || gesture.current) return;
    const room = useStore.getState().project.rooms.find((r) => r.id === selRoomId);
    if (!room) return;
    const v = useView.getState();
    const pad = 48;
    const sx1 = room.x * v.zoom + v.panX;
    const sy1 = room.y * v.zoom + v.panY;
    const sx2 = sx1 + room.w * v.zoom;
    const sy2 = sy1 + room.h * v.zoom;
    if (sx1 >= pad && sy1 >= pad && sx2 <= v.width - pad && sy2 <= v.height - pad) return;
    if (room.w * v.zoom > v.width - pad * 2 || room.h * v.zoom > v.height - pad * 2) {
      v.requestFit();
      return;
    }
    setView({
      panX: v.width / 2 - (room.x + room.w / 2) * v.zoom,
      panY: v.height / 2 - (room.y + room.h / 2) * v.zoom,
    });
  }, [selRoomId, setView]);

  const toWorld = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = useView.getState();
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
  };

  const dragThreshold = touchUi ? 8 : 4;
  const px = (n: number) => n / zoom; // 画面px → mm

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useStore.getState();
    const v = useView.getState();

    if (pointers.current.size === 2) {
      // ピンチ開始: 進行中の操作は確定させる
      const g = gesture.current;
      if (g && 'began' in g && g.began) st.endDrag();
      const [a, b] = Array.from(pointers.current.values());
      const r = svgRef.current!.getBoundingClientRect();
      gesture.current = {
        kind: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: v.zoom,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
        panX: v.panX,
        panY: v.panY,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    const target = e.target as Element;
    const sx = e.clientX;
    const sy = e.clientY;
    if (e.button === 1) {
      gesture.current = { kind: 'pan', sx, sy, panX: v.panX, panY: v.panY, moved: true };
      return;
    }
    if (st.tool.kind === 'placeOpening') {
      gesture.current = { kind: 'place', sx, sy, moved: false, panX: v.panX, panY: v.panY };
      return;
    }
    if (st.mode === 'furniture') {
      const sel = st.selection?.kind === 'furniture' ? st.project.furniture.find((f) => f.id === st.selection!.id) : undefined;
      if (sel && target.closest('[data-frotate]')) {
        gesture.current = { kind: 'frotate', id: sel.id, began: false };
        return;
      }
      const fh = target.closest('[data-fhandle]');
      if (sel && fh) {
        gesture.current = { kind: 'fresize', id: sel.id, handle: fh.getAttribute('data-fhandle') as FurnitureHandle, orig: sel, began: false };
        return;
      }
      const fe = target.closest('[data-furniture-id]');
      if (fe) {
        const id = fe.getAttribute('data-furniture-id')!;
        const f = st.project.furniture.find((x) => x.id === id);
        if (f) {
          st.select({ kind: 'furniture', id });
          gesture.current = { kind: 'furniture', id, sx, sy, orig: f, moved: false, began: false };
          return;
        }
      }
      gesture.current = { kind: 'pan', sx, sy, panX: v.panX, panY: v.panY, moved: false };
      return;
    }
    const addBtn = target.closest('[data-add-dir]');
    if (addBtn) {
      gesture.current = {
        kind: 'button',
        baseId: addBtn.getAttribute('data-base-id')!,
        dir: addBtn.getAttribute('data-add-dir') as Side,
        sx,
        sy,
        moved: false,
      };
      return;
    }
    const handle = target.closest('[data-handle]');
    if (handle && st.selection?.kind === 'room') {
      const room = st.project.rooms.find((r) => r.id === st.selection!.id);
      if (room) {
        gesture.current = {
          kind: 'resize',
          id: room.id,
          handle: handle.getAttribute('data-handle') as ResizeHandle,
          orig: { x: room.x, y: room.y, w: room.w, h: room.h },
          began: false,
        };
        return;
      }
    }
    const op = target.closest('[data-opening-id]');
    if (op) {
      const id = op.getAttribute('data-opening-id')!;
      st.select({ kind: 'opening', id });
      gesture.current = { kind: 'opening', id, sx, sy, moved: false, began: false };
      return;
    }
    const roomEl = target.closest('[data-room-id]');
    if (roomEl) {
      const id = roomEl.getAttribute('data-room-id')!;
      const room = st.project.rooms.find((r) => r.id === id);
      if (room) {
        st.select({ kind: 'room', id });
        gesture.current = {
          kind: 'room',
          id,
          sx,
          sy,
          orig: { x: room.x, y: room.y, w: room.w, h: room.h },
          carry: st.project.furniture
            .filter((f) => f.floorId === room.floorId && f.x > room.x && f.x < room.x + room.w && f.y > room.y && f.y < room.y + room.h)
            .map((f) => ({ id: f.id, x: f.x, y: f.y })),
          moved: false,
          began: false,
        };
        return;
      }
    }
    gesture.current = { kind: 'pan', sx, sy, panX: v.panX, panY: v.panY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const st = useStore.getState();
    const v = useView.getState();

    if (!g) {
      if (e.pointerType === 'mouse' && st.mode === 'plan' && st.tool.kind === 'select') {
        // PC: マウスを乗せた部屋にも＋ボタンを表示（＋ボタンへ移動する間は維持）
        const t = e.target as Element;
        const rid = t.closest('[data-room-id]')?.getAttribute('data-room-id');
        if (rid) {
          if (rid !== hoverRoomId) setHoverRoomId(rid);
        } else if (hoverRoomId && !t.closest('[data-add-dir]')) {
          const room = st.project.rooms.find((r) => r.id === hoverRoomId);
          const p = toWorld(e.clientX, e.clientY);
          const m = 70 / v.zoom + st.project.settings.exteriorWallThickness;
          if (!room || p.x < room.x - m || p.x > room.x + room.w + m || p.y < room.y - m || p.y > room.y + room.h + m) {
            setHoverRoomId(null);
          }
        }
      }
      if (st.tool.kind === 'placeOpening') {
        const def = openingDef(st.tool.type);
        setGhost(nearestWall(toWorld(e.clientX, e.clientY), activeRooms(st.project), def.width, Math.max(300, 30 / v.zoom), 50));
      }
      return;
    }
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = Array.from(pointers.current.values());
      const r = svgRef.current!.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const nz = clampZoom(g.zoom * (dist / Math.max(g.dist, 1)));
      const k = nz / g.zoom;
      setView({ zoom: nz, panX: mx - (g.mx - g.panX) * k, panY: my - (g.my - g.panY) * k });
      return;
    }
    const dx = e.clientX - ('sx' in g ? g.sx : 0);
    const dy = e.clientY - ('sy' in g ? g.sy : 0);
    const far = Math.hypot(dx, dy) > dragThreshold;

    switch (g.kind) {
      case 'pan':
      case 'place':
        if (far) g.moved = true;
        if (g.moved) setView({ panX: g.panX + dx, panY: g.panY + dy });
        if (g.kind === 'place' && st.tool.kind === 'placeOpening' && !g.moved) {
          const def = openingDef(st.tool.type);
          setGhost(nearestWall(toWorld(e.clientX, e.clientY), activeRooms(st.project), def.width, Math.max(300, 30 / v.zoom), 50));
        }
        return;
      case 'button':
        if (far) g.moved = true;
        return;
      case 'room': {
        if (!g.moved && !far) return;
        g.moved = true;
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const others = activeRooms(st.project).filter((r) => r.id !== g.id);
        const moved = snapMove(
          { ...g.orig, x: g.orig.x + dx / v.zoom, y: g.orig.y + dy / v.zoom },
          others,
          st.project.settings.gridSize,
          12 / v.zoom,
        );
        if (!overlapsAny(moved, others)) {
          const ddx = moved.x - g.orig.x;
          const ddy = moved.y - g.orig.y;
          const carry = new Map(g.carry.map((c) => [c.id, c]));
          st.dragUpdate((p) => {
            const next = withRoomRect(p, g.id, moved);
            if (carry.size === 0) return next;
            return {
              ...next,
              furniture: next.furniture.map((f) => {
                const c = carry.get(f.id);
                return c ? { ...f, x: c.x + ddx, y: c.y + ddy } : f;
              }),
            };
          });
        }
        return;
      }
      case 'furniture': {
        if (!g.moved && !far) return;
        g.moved = true;
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const pos = snapFurnitureMove(
          g.orig,
          g.orig.x + dx / v.zoom,
          g.orig.y + dy / v.zoom,
          wallFaces(st.project, activeRooms(st.project)),
          st.project.settings.furnitureGrid,
          10 / v.zoom,
        );
        st.dragUpdate((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === g.id ? { ...f, ...pos } : f)) }));
        return;
      }
      case 'fresize': {
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const r = resizeFurniture(g.orig, g.handle, toWorld(e.clientX, e.clientY), 10);
        st.dragUpdate((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === g.id ? { ...f, ...r } : f)) }));
        return;
      }
      case 'frotate': {
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const f = st.project.furniture.find((x) => x.id === g.id);
        if (!f) return;
        const rotation = angleFromPointer(f, toWorld(e.clientX, e.clientY), e.shiftKey ? 1 : 15);
        st.dragUpdate((p) => ({ ...p, furniture: p.furniture.map((x) => (x.id === g.id ? { ...x, rotation } : x)) }));
        return;
      }
      case 'resize': {
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const others = activeRooms(st.project).filter((r) => r.id !== g.id);
        const rect = resizeRect(
          g.orig,
          g.handle,
          toWorld(e.clientX, e.clientY),
          others,
          st.project.settings.gridSize,
          12 / v.zoom,
          455,
        );
        if (!overlapsAny(rect, others)) st.dragUpdate((p) => withRoomRect(p, g.id, rect));
        return;
      }
      case 'opening': {
        if (!g.moved && !far) return;
        g.moved = true;
        if (!g.began) {
          st.beginDrag();
          g.began = true;
        }
        const o = st.project.openings.find((x) => x.id === g.id);
        if (!o) return;
        const hit = nearestWall(toWorld(e.clientX, e.clientY), activeRooms(st.project), o.width, 1500, 50);
        if (hit && hit.width >= openingDef(o.type).minWidth) {
          st.dragUpdate((p) => ({
            ...p,
            openings: p.openings.map((x) =>
              x.id === g.id ? { ...x, roomId: hit.roomId, side: hit.side, offset: hit.offset, width: hit.width } : x,
            ),
          }));
        }
        return;
      }
    }
  };

  const finish = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const st = useStore.getState();
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null;
      return;
    }
    gesture.current = null;
    if ('began' in g && g.began) st.endDrag();
    if (cancelled) return;
    if (g.kind === 'button' && !g.moved) st.openAddDialog({ baseId: g.baseId, dir: g.dir });
    if (g.kind === 'pan' && !g.moved) st.select(null);
    if (g.kind === 'place' && !g.moved && st.tool.kind === 'placeOpening') {
      const def = openingDef(st.tool.type);
      const v = useView.getState();
      const hit = nearestWall(toWorld(e.clientX, e.clientY), activeRooms(st.project), def.width, Math.max(300, 30 / v.zoom), 50);
      if (hit) {
        st.addOpening(st.tool.type, hit);
        st.setTool({ kind: 'select' });
      } else {
        st.notify(`${def.label}は壁の上に配置してください。`, 'error');
      }
    }
  };

  // パレットからのドラッグ＆ドロップ（PC）
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ROOM_DRAG_MIME) || e.dataTransfer.types.includes(FURNITURE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const ftype = e.dataTransfer.getData(FURNITURE_DRAG_MIME);
    if (ftype) {
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      const g = project.settings.furnitureGrid;
      useStore.getState().addFurniture(ftype, { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g });
      return;
    }
    const type = e.dataTransfer.getData(ROOM_DRAG_MIME) as RoomType;
    if (!type) return;
    e.preventDefault();
    const st = useStore.getState();
    const def = roomDef(type);
    const p = toWorld(e.clientX, e.clientY);
    const others = activeRooms(st.project);
    const start = snapMove({ x: p.x - def.w / 2, y: p.y - def.h / 2, w: def.w, h: def.h }, others, grid, 20 / zoom);
    const rect = findFreeSpot(start, others, grid, 6);
    if (rect) st.addRoomAt(type, rect);
    else st.notify('他の部屋と重なるため、ここには置けません。', 'error');
  };

  // ---- 表示 ----
  const planMode = mode === 'plan';
  const below = floorBelow(project);
  const selRoom = planMode && selection?.kind === 'room' ? rooms.find((r) => r.id === selection.id) : undefined;
  const selFurniture =
    !planMode && selection?.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : undefined;
  const plusRoom = planMode && tool.kind === 'select' ? selRoom ?? rooms.find((r) => r.id === hoverRoomId) : undefined;
  const furniture = project.furniture.filter((f) => f.floorId === floorId);
  const selOpening = selection?.kind === 'opening' ? project.openings.find((o) => o.id === selection.id) : undefined;
  const selOpeningRoom = selOpening ? rooms.find((r) => r.id === selOpening.roomId) : undefined;

  const visible = {
    x: -panX / zoom,
    y: -panY / zoom,
    w: width / zoom,
    h: height / zoom,
  };
  const major = project.settings.majorGridSize;
  const showMinor = grid * zoom > 6;
  const handleSize = px(touchUi ? 22 : 11);
  const btnR = px(touchUi ? 17 : 13);
  const btnGap = px(touchUi ? 34 : 28) + project.settings.exteriorWallThickness;
  const fontPx = px(12);

  // ＋ボタン: 最小 910mm 角の部屋が置ける方向だけ表示
  const addButtons = plusRoom
    ? (['top', 'right', 'bottom', 'left'] as Side[]).filter(
        (dir) => findAdjacentPlacement(plusRoom, dir, 910, 910, rooms, grid) !== null,
      )
    : [];
  const issues = useMemo(() => (planMode ? new Map() : checkFurniture(project)), [project, planMode]);
  const warnIds = useMemo(() => new Set(issues.keys()), [issues]);
  const flow = useMemo(() => (planMode || !showFlow ? [] : checkFlow(project)), [project, planMode, showFlow]);
  const flowIds = useMemo(() => new Set(flow.map((i) => i.id)), [flow]);

  const openingBand = (o: typeof selOpening, room: typeof selOpeningRoom, extra: number) => {
    if (!o || !room) return '';
    const g = openingGeom(o, room);
    const t = Math.max(project.settings.exteriorWallThickness, extra);
    return g.orientation === 'h'
      ? `${g.start},${g.pos - t / 2} ${g.end},${g.pos - t / 2} ${g.end},${g.pos + t / 2} ${g.start},${g.pos + t / 2}`
      : `${g.pos - t / 2},${g.start} ${g.pos + t / 2},${g.start} ${g.pos + t / 2},${g.end} ${g.pos - t / 2},${g.end}`;
  };

  return (
    <svg
      ref={svgRef}
      className={`canvas ${tool.kind === 'placeOpening' ? 'placing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onPointerLeave={() => tool.kind === 'placeOpening' && !gesture.current && setGhost(null)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      role="application"
      aria-label="間取りキャンバス"
    >
      <defs>
        <pattern id="grid-minor" patternUnits="userSpaceOnUse" width={grid} height={grid}>
          <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#e7e3da" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
        <pattern id="grid-major" patternUnits="userSpaceOnUse" width={major} height={major}>
          <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#d6d0c4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
        {showMinor && <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#grid-minor)" />}
        <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#grid-major)" />

        {/* 下の階を薄く表示（上下の階の位置合わせ用） */}
        {below && showBelow && (
          <g opacity={0.25} pointerEvents="none">
            <PlanDrawing project={project} floorId={below.id} showFixtures={false} idPrefix="below-" labels={false} />
          </g>
        )}
        <PlanDrawing
          project={project}
          floorId={floorId}
          highlightOpeningId={selOpening?.id}
          labels={false}
          overlay={
            // 家具（間取り作成モードでは薄く表示し、操作しない）
            <g opacity={planMode ? 0.35 : 1} pointerEvents="none">
              <FurnitureLayer items={furniture} warnIds={warnIds} />
            </g>
          }
        />
        {/* 部屋名・広さ（・寸法）。画面上の大きさ基準なので、ズームしても読みやすい */}
        <RoomLabels project={project} floorId={floorId} zoom={zoom} mode={showRoomDims ? 'dimensions' : 'normal'} />

        {/* 当たり判定レイヤー */}
        <g className={tool.kind === 'placeOpening' || !planMode ? 'no-hit' : ''}>
          {rooms.map((r) => (
            <rect
              key={r.id}
              data-room-id={r.id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="transparent"
              className="hit-room"
            />
          ))}
          {project.openings
            .filter((o) => o.floorId === floorId)
            .map((o) => {
              const room = rooms.find((r) => r.id === o.roomId);
              if (!room) return null;
              return (
                <polygon
                  key={o.id}
                  data-opening-id={o.id}
                  points={openingBand(o, room, px(touchUi ? 28 : 16))}
                  fill="transparent"
                  className="hit-opening"
                />
              );
            })}
        </g>

        {/* 選択中の開口部 */}
        {selOpening && selOpeningRoom && (
          <polygon
            points={openingBand(selOpening, selOpeningRoom, px(14))}
            fill="rgba(31,122,99,0.12)"
            stroke={ACCENT}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        {/* 選択中の部屋 */}
        {selRoom && (
          <g>
            <rect
              x={selRoom.x}
              y={selRoom.y}
              width={selRoom.w}
              height={selRoom.h}
              fill="rgba(31,122,99,0.06)"
              stroke={ACCENT}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* 寸法表示 */}
            <g fontSize={fontPx} fill={ACCENT} fontWeight={700} textAnchor="middle" pointerEvents="none" fontFamily="system-ui,sans-serif">
              <text
                x={selRoom.x + selRoom.w / 2}
                y={selRoom.y + handleSize * 0.5 + fontPx * 1.2}
                paintOrder="stroke"
                stroke="#fff"
                strokeWidth={fontPx * 0.3}
              >
                {formatMm(selRoom.w)}
              </text>
              <text
                transform={`translate(${selRoom.x + handleSize * 0.5 + fontPx * 1.2} ${selRoom.y + selRoom.h / 2}) rotate(-90)`}
                paintOrder="stroke"
                stroke="#fff"
                strokeWidth={fontPx * 0.3}
              >
                {formatMm(selRoom.h)}
              </text>
            </g>
            {tool.kind === 'select' &&
              HANDLES.map((h) => {
                const p = handlePos(selRoom, h);
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    x={p.x - handleSize / 2}
                    y={p.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={handleSize * 0.2}
                    fill="#fff"
                    stroke={ACCENT}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: CURSORS[h] }}
                  />
                );
              })}
          </g>
        )}

        {/* 隣に部屋を追加する＋ボタン */}
        {plusRoom && addButtons.map((dir) => {
          const cx =
            dir === 'left' ? plusRoom.x - btnGap : dir === 'right' ? plusRoom.x + plusRoom.w + btnGap : plusRoom.x + plusRoom.w / 2;
          const cy =
            dir === 'top' ? plusRoom.y - btnGap : dir === 'bottom' ? plusRoom.y + plusRoom.h + btnGap : plusRoom.y + plusRoom.h / 2;
          return (
            <g key={dir} data-add-dir={dir} data-base-id={plusRoom.id} className="add-btn" role="button" aria-label={`${dir}に部屋を追加`}>
              <circle cx={cx} cy={cy} r={btnR * 1.5} fill="transparent" />
              <circle cx={cx} cy={cy} r={btnR} fill={ACCENT} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <path
                d={`M ${cx - btnR * 0.5} ${cy} H ${cx + btnR * 0.5} M ${cx} ${cy - btnR * 0.5} V ${cy + btnR * 0.5}`}
                stroke="#fff"
                strokeWidth={2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {/* 生活動線チェックの表示（ドアの開閉範囲・家具の前の空き・すき間） */}
        {!planMode && showFlow && (
          <g pointerEvents="none">
            {project.openings
              .filter((o) => o.floorId === floorId && openingDef(o.type).kind === 'door')
              .map((o) => {
                const room = rooms.find((r) => r.id === o.roomId);
                if (!room) return null;
                const bad = flowIds.has(`door:${o.id}`);
                return (
                  <polygon
                    key={o.id}
                    points={doorSwingPolygon(o, room).map((q) => `${q.x},${q.y}`).join(' ')}
                    fill={bad ? 'rgba(214,69,48,0.22)' : 'rgba(58,124,170,0.10)'}
                    stroke={bad ? '#d64530' : '#3a7caa'}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            {furniture.map((f) => {
              const zone = frontZone(f);
              if (!zone) return null;
              const bad = flowIds.has(`front:${f.id}`);
              return (
                <polygon
                  key={f.id}
                  points={zone.map((q) => `${q.x},${q.y}`).join(' ')}
                  fill={bad ? 'rgba(214,69,48,0.18)' : 'rgba(58,124,170,0.06)'}
                  stroke={bad ? '#d64530' : '#7aa6c4'}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {flow.map((i) => {
              if (i.shape.kind !== 'gap') return null;
              const { a, b, distance } = i.shape;
              return (
                <g key={i.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d9a032" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 + fontPx * 0.35}
                    fontSize={fontPx}
                    textAnchor="middle"
                    fontWeight={700}
                    fill="#8a5a00"
                    paintOrder="stroke"
                    stroke="#fff"
                    strokeWidth={fontPx * 0.3}
                    fontFamily="system-ui,sans-serif"
                  >
                    {Math.round(distance / 10)}cm
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* 家具の当たり判定と選択 */}
        {!planMode && (
          <g>
            {furniture.map((f) => (
              <polygon
                key={f.id}
                data-furniture-id={f.id}
                points={furnitureCorners(f).map((c) => `${c.x},${c.y}`).join(' ')}
                fill="transparent"
                className="hit-furniture"
              />
            ))}
            {furniture
              .filter((f) => showDims || f.id === selFurniture?.id)
              .map((f) => (
                <text
                  key={f.id}
                  x={f.x}
                  y={f.y + fontPx * 0.4}
                  fontSize={fontPx}
                  textAnchor="middle"
                  fontWeight={700}
                  fill={warnIds.has(f.id) ? '#b3412f' : ACCENT}
                  paintOrder="stroke"
                  stroke="#fff"
                  strokeWidth={fontPx * 0.3}
                  pointerEvents="none"
                  fontFamily="system-ui,sans-serif"
                >
                  {formatMm(f.w)}×{formatMm(f.d)}
                </text>
              ))}
          </g>
        )}
        {selFurniture && (() => {
          const f = selFurniture;
          const top = handleWorld(f, 'n');
          const rad = (f.rotation * Math.PI) / 180;
          const off = px(touchUi ? 40 : 30);
          const rot = { x: top.x + Math.sin(rad) * off, y: top.y - Math.cos(rad) * off };
          return (
            <g>
              <polygon
                points={furnitureCorners(f).map((c) => `${c.x},${c.y}`).join(' ')}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke={ACCENT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <g data-frotate="1" style={{ cursor: 'grab' }} role="button" aria-label="回転">
                <circle cx={rot.x} cy={rot.y} r={btnR * 1.4} fill="transparent" />
                <circle cx={rot.x} cy={rot.y} r={btnR * 0.75} fill="#fff" stroke={ACCENT} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <text x={rot.x} y={rot.y + btnR * 0.35} fontSize={btnR} textAnchor="middle" fill={ACCENT} pointerEvents="none">
                  ↻
                </text>
              </g>
              {/* 画面上で小さい家具はハンドルが本体を隠すため省略（拡大するか詳細パネルで変更） */}
              {Math.min(f.w, f.d) * zoom >= (touchUi ? 70 : 36) && FURNITURE_HANDLES.map((h) => {
                const p = handleWorld(f, h);
                const hs = handleSize * 0.85;
                return (
                  <rect
                    key={h}
                    data-fhandle={h}
                    x={p.x - hs / 2}
                    y={p.y - hs / 2}
                    width={hs}
                    height={hs}
                    rx={hs * 0.5}
                    fill="#fff"
                    stroke={ACCENT}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </g>
          );
        })()}

        {/* 開口部配置のプレビュー */}
        {ghost && tool.kind === 'placeOpening' && (() => {
          const room = rooms.find((r) => r.id === ghost.roomId);
          if (!room) return null;
          const fake = { offset: ghost.offset, width: ghost.width, side: ghost.side } as typeof selOpening;
          return (
            <polygon
              points={openingBand(fake, room, px(14))}
              fill="rgba(31,122,99,0.35)"
              stroke={ACCENT}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          );
        })()}
      </g>
    </svg>
  );
}
