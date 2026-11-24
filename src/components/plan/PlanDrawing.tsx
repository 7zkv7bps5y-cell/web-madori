import { memo, useMemo, type ReactElement, type ReactNode } from 'react';
import { openingDef, roomDef } from '../../model/catalog';
import { computeWalls, EPS, openingGeom, type OpeningGeom } from '../../model/geometry';
import type { Opening, Project, Room, WallSegment } from '../../model/types';
import { wallKind, wallThicknessOf } from '../../model/collision';
import { CustomPartLayer } from './CustomPartShape';
import { RoomFixtures } from './Fixtures';
import type { Vec } from '../../model/flowCheck';
import { doorSwingObstacles, layoutRoomLabel, type LabelLine, type LabelMode } from './labelLayout';

const WALL_COLOR = '#3b3833';
const RAILING_COLOR = '#9b958a';
const LINE = '#3b3833';

export function resolveFloor(room: Room) {
  return room.style.floor === 'auto' ? roomDef(room.type).floor : room.style.floor;
}

function FloorPatternDefs({ room, prefix }: { room: Room; prefix: string }) {
  const floor = resolveFloor(room);
  const id = `${prefix}pat-${room.id}`;
  // 回転に合わせて模様の向きも回す
  const transform = `translate(${room.x} ${room.y})${room.rotation % 180 ? ' rotate(90)' : ''}`;
  switch (floor) {
    case 'tatami':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={1820} height={1820} patternTransform={transform}>
          <g fill="#e6ecc4" stroke="#a9b37a" strokeWidth={16}>
            <rect x={0} y={0} width={1820} height={910} />
            <rect x={-910} y={910} width={1820} height={910} />
            <rect x={910} y={910} width={1820} height={910} />
          </g>
        </pattern>
      );
    case 'flooring':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={1820} height={151.66} patternTransform={transform}>
          <line x1={0} y1={0} x2={1820} y2={0} stroke="#e7d9bd" strokeWidth={8} />
        </pattern>
      );
    case 'tile':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={300} height={300} patternTransform={`translate(${room.x} ${room.y})`}>
          <path d="M 300 0 L 0 0 0 300" fill="none" stroke="#c9d6da" strokeWidth={8} />
        </pattern>
      );
    default:
      return null;
  }
}

function RoomBody({ room, showFixtures, prefix }: { room: Room; showFixtures: boolean; prefix: string }) {
  const fill = room.style.fill ?? roomDef(room.type).fill;
  const floor = resolveFloor(room);
  return (
    <g>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={fill} />
      {floor !== 'none' && (
        <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={`url(#${prefix}pat-${room.id})`} />
      )}
      {showFixtures && room.style.showFixtures && (
        <g clipPath={`url(#${prefix}clip-${room.id})`}>
          <RoomFixtures room={room} />
        </g>
      )}
    </g>
  );
}

const LABEL_FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
const LABEL_COLOR: Record<LabelLine['kind'], string> = { name: '#2d2a26', dims: '#1f5f4d', area: '#5d574e' };

/** 部屋名・広さ・寸法のラベル（文字は部屋に収まるよう自動で縮小・省略） */
export function RoomLabel({
  room,
  project,
  mode = 'normal',
  zoom,
  obstacles,
}: {
  room: Room;
  project: Project;
  mode?: LabelMode;
  zoom?: number;
  /** 避ける場所（ドアの開閉範囲） */
  obstacles?: Vec[][];
}) {
  const layout = layoutRoomLabel(room, {
    mode,
    zoom,
    obstacles,
    areaUnit: project.settings.areaUnit,
    tatamiArea: project.settings.tatamiArea,
  });
  if (!layout) return null;
  return (
    <g pointerEvents="none" fontFamily={LABEL_FONT} textAnchor="middle">
      {layout.lines.map((l) => (
        <text
          key={l.kind}
          x={layout.x}
          y={layout.y + l.dy}
          fontSize={l.size}
          fontWeight={l.weight}
          fill={LABEL_COLOR[l.kind]}
          paintOrder="stroke"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={l.size * 0.2}
          strokeLinejoin="round"
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

/** 指定した階の全部屋のラベル */
export function RoomLabels({ project, floorId, mode = 'normal', zoom }: { project: Project; floorId: string; mode?: LabelMode; zoom?: number }) {
  const obstacles = useMemo(() => doorSwingObstacles(project, floorId), [project, floorId]);
  return (
    <g>
      {project.rooms
        .filter((r) => r.floorId === floorId)
        .map((r) => (
          <RoomLabel key={r.id} room={r} project={project} mode={mode} zoom={zoom} obstacles={obstacles} />
        ))}
    </g>
  );
}

interface PlacedOpening {
  opening: Opening;
  g: OpeningGeom;
  thickness: number;
}

const wallThickness = wallThicknessOf;

/** 壁を開口部の位置で切り分け、太線（矩形）として描画する */
function Walls({ walls, openings, project }: { walls: WallSegment[]; openings: PlacedOpening[]; project: Project }) {
  const rects: ReactElement[] = [];
  for (const w of walls) {
    const t = wallThickness(w, project);
    const color = wallKind(w, project) === 'railing' ? RAILING_COLOR : WALL_COLOR;
    const cuts = openings
      .filter((o) => o.g.orientation === w.orientation && Math.abs(o.g.pos - w.pos) < EPS)
      .map((o) => [Math.max(o.g.start, w.start), Math.min(o.g.end, w.end)] as const)
      .filter(([a, b]) => b - a > EPS)
      .sort((a, b) => a[0] - b[0]);
    let cursor = w.start;
    let extendStart = true;
    const pieces: [number, number, boolean, boolean][] = [];
    for (const [a, b] of cuts) {
      if (a > cursor + EPS) pieces.push([cursor, a, extendStart, false]);
      cursor = Math.max(cursor, b);
      extendStart = false;
    }
    if (w.end > cursor + EPS) pieces.push([cursor, w.end, extendStart, true]);
    pieces.forEach(([a, b, es, ee], i) => {
      const s = a - (es ? t / 2 : 0);
      const e = b + (ee ? t / 2 : 0);
      rects.push(
        w.orientation === 'h' ? (
          <rect key={`${w.id}-${i}`} x={s} y={w.pos - t / 2} width={e - s} height={t} fill={color} />
        ) : (
          <rect key={`${w.id}-${i}`} x={w.pos - t / 2} y={s} width={t} height={e - s} fill={color} />
        ),
      );
    });
  }
  return <g pointerEvents="none">{rects}</g>;
}

/** ローカル座標 (u: 壁方向, v: 部屋の内側方向) → ワールド座標 */
function toWorld(g: OpeningGeom, u: number, v: number): [number, number] {
  return g.orientation === 'h' ? [u, g.pos + v * g.inward] : [g.pos + v * g.inward, u];
}
function pts(g: OpeningGeom, list: [number, number][]): string {
  return list.map(([u, v]) => toWorld(g, u, v).join(',')).join(' ');
}
function bandRect(g: OpeningGeom, u1: number, u2: number, v1: number, v2: number) {
  return pts(g, [
    [u1, v1],
    [u2, v1],
    [u2, v2],
    [u1, v2],
  ]);
}

export function OpeningSymbol({ opening, g, thickness, color = LINE }: PlacedOpening & { color?: string }) {
  const def = openingDef(opening.type);
  const t = thickness;
  const sw = 16;
  const gap = <polygon points={bandRect(g, g.start, g.end, -t / 2, t / 2)} fill="#ffffff" />;
  if (def.kind === 'door') {
    const W = g.end - g.start;
    const uh = opening.hinge === 'start' ? g.start : g.end;
    const dirU = opening.hinge === 'start' ? 1 : -1;
    const s = opening.swing === 'in' ? 1 : -1;
    const arc: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const th = (i / 16) * (Math.PI / 2);
      arc.push([uh + dirU * W * Math.sin(th), s * W * Math.cos(th)]);
    }
    const leafT = opening.type === 'entranceDoor' ? 60 : 35;
    return (
      <g>
        {gap}
        <polyline points={pts(g, arc)} fill="none" stroke={color} strokeWidth={sw} strokeDasharray="60 40" />
        <polygon
          points={bandRect(g, uh, uh + dirU * leafT, 0, s * W)}
          fill="#fff"
          stroke={color}
          strokeWidth={opening.type === 'entranceDoor' ? sw * 1.6 : sw}
        />
        {/* 枠 */}
        <polyline points={pts(g, [[g.start, -t / 2], [g.start, t / 2]])} stroke={color} strokeWidth={sw * 1.5} />
        <polyline points={pts(g, [[g.end, -t / 2], [g.end, t / 2]])} stroke={color} strokeWidth={sw * 1.5} />
      </g>
    );
  }
  if (def.kind === 'sliding') {
    const W = g.end - g.start;
    const pw = W * 0.55;
    return (
      <g>
        {gap}
        <polygon points={bandRect(g, g.start, g.start + pw, -t * 0.35, -t * 0.05)} fill="#fff" stroke={color} strokeWidth={sw} />
        <polygon points={bandRect(g, g.end - pw, g.end, t * 0.05, t * 0.35)} fill="#fff" stroke={color} strokeWidth={sw} />
      </g>
    );
  }
  // 窓
  const W = g.end - g.start;
  const outline = <polygon points={bandRect(g, g.start, g.end, -t / 2, t / 2)} fill="#fff" stroke={color} strokeWidth={sw} />;
  if (opening.type === 'window') {
    return (
      <g>
        {outline}
        <polyline points={pts(g, [[g.start, 0], [g.end, 0]])} stroke={color} strokeWidth={sw} />
      </g>
    );
  }
  const pw = W * 0.55;
  return (
    <g>
      {outline}
      <polyline points={pts(g, [[g.start, -t * 0.12], [g.start + pw, -t * 0.12]])} stroke={color} strokeWidth={sw * 1.6} />
      <polyline points={pts(g, [[g.end - pw, t * 0.12], [g.end, t * 0.12]])} stroke={color} strokeWidth={sw * 1.6} />
      {opening.type === 'floorWindow' && (
        // 掃き出し窓: 室外側にテラス/ウッドデッキへの出入りを示す線
        <polyline
          points={pts(g, [[g.start, -t / 2 - 90], [g.end, -t / 2 - 90]])}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray="50 40"
        />
      )}
    </g>
  );
}

export function placeOpenings(project: Project, rooms: Room[], walls: WallSegment[]): PlacedOpening[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const out: PlacedOpening[] = [];
  for (const o of project.openings) {
    const room = byId.get(o.roomId);
    if (!room) continue;
    const g = openingGeom(o, room);
    const wall = walls.find(
      (w) => w.orientation === g.orientation && Math.abs(w.pos - g.pos) < EPS && w.start < g.end && w.end > g.start,
    );
    out.push({ opening: o, g, thickness: wall ? wallThickness(wall, project) : project.settings.exteriorWallThickness });
  }
  return out;
}

export interface PlanDrawingProps {
  project: Project;
  floorId: string;
  showFixtures?: boolean;
  /** 指定した開口部は通常描画しない（編集中のハイライト用） */
  highlightOpeningId?: string | null;
  /** 同じ画面に複数の間取りを描くとき、SVG 内 ID の衝突を避ける接頭辞 */
  idPrefix?: string;
  /** 部屋・壁の上、部屋名ラベルの下に描くもの（家具レイヤー） */
  overlay?: ReactNode;
  /** false なら部屋名ラベルを描かない（編集画面はズームに合わせて別に描く） */
  labels?: boolean;
  /** dimensions = 寸法・畳数・面積も表示（寸法付き間取り図） */
  labelMode?: LabelMode;
}

/** 間取り図本体（エディタ・画像出力で共通） */
export const PlanDrawing = memo(function PlanDrawing({
  project,
  floorId,
  showFixtures = true,
  highlightOpeningId,
  idPrefix = '',
  overlay,
  labels = true,
  labelMode = 'normal',
}: PlanDrawingProps) {
  const rooms = useMemo(() => project.rooms.filter((r) => r.floorId === floorId), [project.rooms, floorId]);
  const walls = useMemo(() => computeWalls(rooms, floorId), [rooms, floorId]);
  const doorObstacles = useMemo(() => doorSwingObstacles(project, floorId), [project, floorId]);
  const openings = useMemo(() => placeOpenings(project, rooms, walls), [project, rooms, walls]);
  return (
    <g>
      <defs>
        {rooms.map((r) => (
          <g key={r.id}>
            <FloorPatternDefs room={r} prefix={idPrefix} />
            <clipPath id={`${idPrefix}clip-${r.id}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} />
            </clipPath>
          </g>
        ))}
      </defs>
      {rooms.map((r) => (
        <RoomBody key={r.id} room={r} showFixtures={showFixtures} prefix={idPrefix} />
      ))}
      <Walls walls={walls} openings={openings} project={project} />
      <g pointerEvents="none">
        {openings.map((o) => (
          <OpeningSymbol key={o.opening.id} {...o} color={o.opening.id === highlightOpeningId ? '#1f7a63' : LINE} />
        ))}
      </g>
      {/* カスタムパーツ（参考情報の画像などは描かない） */}
      <CustomPartLayer items={project.customParts.filter((c) => c.floorId === floorId)} prefix={idPrefix} />
      {overlay}
      {labels && rooms.map((r) => <RoomLabel key={r.id} room={r} project={project} mode={labelMode} obstacles={doorObstacles} />)}
    </g>
  );
});
