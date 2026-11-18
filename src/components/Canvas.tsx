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
import type { Project, Rect, RoomType, Side } from '../model/types';
import { formatMm } from '../model/units';
import { activeRooms, useStore } from '../store/store';
import { clampZoom, useView } from '../store/view';
import { PlanDrawing } from './plan/PlanDrawing';

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number; moved: boolean }
  | { kind: 'room'; id: string; sx: number; sy: number; orig: Rect; moved: boolean; began: boolean }
  | { kind: 'resize'; id: string; handle: ResizeHandle; orig: Rect; began: boolean }
  | { kind: 'opening'; id: string; sx: number; sy: number; moved: boolean; began: boolean }
  | { kind: 'button'; baseId: string; dir: Side; sx: number; sy: number; moved: boolean }
  | { kind: 'place'; sx: number; sy: number; moved: boolean; panX: number; panY: number }
  | { kind: 'pinch'; dist: number; zoom: number; mx: number; my: number; panX: number; panY: number };

const ACCENT = '#1f7a63';
export const ROOM_DRAG_MIME = 'application/x-madori-room';

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
  const { zoom, panX, panY, width, height, fitSeq } = useView();
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
    const b = boundsOf(activeRooms(useStore.getState().project));
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
        if (!overlapsAny(moved, others)) st.dragUpdate((p) => withRoomRect(p, g.id, moved));
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
    if (e.dataTransfer.types.includes(ROOM_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
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
  const selRoom = selection?.kind === 'room' ? rooms.find((r) => r.id === selection.id) : undefined;
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

  const addButtons = selRoom && tool.kind === 'select'
    ? (['top', 'right', 'bottom', 'left'] as Side[]).filter((dir) => {
        const d = roomDef('room');
        return (
          findAdjacentPlacement(selRoom, dir, Math.min(d.w, 910), Math.min(d.h, 910), rooms, grid) !== null
        );
      })
    : [];

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

        <PlanDrawing project={project} floorId={floorId} highlightOpeningId={selOpening?.id} />

        {/* 当たり判定レイヤー */}
        <g className={tool.kind === 'placeOpening' ? 'no-hit' : ''}>
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
                y={selRoom.y + px(touchUi ? 0 : 0) + fontPx * 1.3}
                paintOrder="stroke"
                stroke="#fff"
                strokeWidth={fontPx * 0.3}
              >
                {formatMm(selRoom.w)}
              </text>
              <text
                transform={`translate(${selRoom.x + fontPx * 1.3} ${selRoom.y + selRoom.h / 2}) rotate(-90)`}
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
            {addButtons.map((dir) => {
              const cx =
                dir === 'left' ? selRoom.x - btnGap : dir === 'right' ? selRoom.x + selRoom.w + btnGap : selRoom.x + selRoom.w / 2;
              const cy =
                dir === 'top' ? selRoom.y - btnGap : dir === 'bottom' ? selRoom.y + selRoom.h + btnGap : selRoom.y + selRoom.h / 2;
              return (
                <g key={dir} data-add-dir={dir} data-base-id={selRoom.id} className="add-btn" role="button" aria-label={`${dir}に部屋を追加`}>
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
          </g>
        )}

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
