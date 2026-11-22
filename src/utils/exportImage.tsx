import { boundsOf } from '../model/geometry';
import { sortedFloors } from '../model/project';
import type { Project, Room } from '../model/types';
import { formatMm } from '../model/units';
import { FurnitureLayer } from '../components/plan/FurnitureShape';
import { PlanDrawing } from '../components/plan/PlanDrawing';
import { downloadBlob, safeFileName } from './io';

export interface ImageOptions {
  /** 1mm あたりのピクセル数 */
  scale: number;
  showGrid: boolean;
  background: 'white' | 'transparent';
  showFixtures: boolean;
  showTitle: boolean;
  /** 家具配置込み */
  showFurniture: boolean;
  /** active = 編集中の階のみ / all = 全階を横に並べる */
  floors: 'active' | 'all';
  /** 右上に添える注記（例: 縮尺 1/100） */
  caption?: string;
  /** 寸法付き: 部屋ごとの寸法・畳数・面積と、建物外周の寸法線を表示 */
  dimensions?: boolean;
}

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  scale: 0.12,
  showGrid: false,
  background: 'white',
  showFixtures: true,
  showTitle: true,
  showFurniture: true,
  floors: 'all',
};

const MAX_PIXELS = 8192;
const FLOOR_GAP = 2400;

/**
 * 複数の階を横に並べる配置。上下の階の位置関係（階段の位置など）が分かるよう、
 * 全階の外形を合わせた範囲を共通の枠として使う。部屋のない階は除く。
 */
export function layoutFloors(project: Project, mode: 'active' | 'all') {
  const ids =
    mode === 'active'
      ? [project.settings.activeFloorId]
      : sortedFloors(project)
          .map((f) => f.id)
          .filter((id) => project.rooms.some((r) => r.floorId === id));
  const floorIds = ids.length ? ids : [project.settings.activeFloorId];
  const union = boundsOf(project.rooms.filter((r) => floorIds.includes(r.floorId))) ?? { x: 0, y: 0, w: 3640, h: 3640 };
  const n = floorIds.length;
  return {
    union,
    items: floorIds.map((id, i) => ({ floor: project.floors.find((f) => f.id === id)!, dx: i * (union.w + FLOOR_GAP) })),
    bounds: { x: union.x, y: union.y, w: union.w * n + FLOOR_GAP * (n - 1), h: union.h },
  };
}

const FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

/** 間取り（複数階なら横並び）の SVG 要素。画像出力・比較のサムネイルで共通 */
/** 寸法線のための外側の余白(mm) */
export const DIMENSION_SPACE = 1400;

/**
 * 建物外周の寸法線（上側と左側）。内側の線は部屋の区切りごと、外側の線は全長。
 * 区切りが短く数字が入らない区間は数字を省く。
 */
function DimensionLines({ rooms }: { rooms: Room[] }) {
  const b = boundsOf(rooms);
  if (!b) return null;
  const COLOR = '#4b463f';
  const SW = 14;
  const FS = 150;
  const TICK = 110;
  const uniq = (vals: number[]) => Array.from(new Set(vals.map((v) => Math.round(v)))).sort((a, c) => a - c);
  const xs = uniq(rooms.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniq(rooms.flatMap((r) => [r.y, r.y + r.h]));
  const chainY = b.y - 650;
  const totalY = b.y - 1150;
  const chainX = b.x - 650;
  const totalX = b.x - 1150;
  const minLabel = (t: string) => t.length * FS * 0.62 + 60;
  const hChain = (vals: number[], y: number, key: string) => (
    <g key={key}>
      <line x1={vals[0]} y1={y} x2={vals[vals.length - 1]} y2={y} stroke={COLOR} strokeWidth={SW} />
      {vals.map((x) => (
        <line key={x} x1={x} y1={y - TICK} x2={x} y2={y + TICK} stroke={COLOR} strokeWidth={SW} />
      ))}
      {vals.slice(1).map((x, i) => {
        const len = x - vals[i];
        const t = formatMm(len);
        return len >= minLabel(t) ? (
          <text key={x} x={(x + vals[i]) / 2} y={y - 60} fontSize={FS} textAnchor="middle" fill={COLOR} fontFamily={FONT}>
            {t}
          </text>
        ) : null;
      })}
    </g>
  );
  const vChain = (vals: number[], x: number, key: string) => (
    <g key={key}>
      <line x1={x} y1={vals[0]} x2={x} y2={vals[vals.length - 1]} stroke={COLOR} strokeWidth={SW} />
      {vals.map((y) => (
        <line key={y} x1={x - TICK} y1={y} x2={x + TICK} y2={y} stroke={COLOR} strokeWidth={SW} />
      ))}
      {vals.slice(1).map((y, i) => {
        const len = y - vals[i];
        const t = formatMm(len);
        const cy = (y + vals[i]) / 2;
        return len >= minLabel(t) ? (
          <text key={y} transform={`translate(${x - 60} ${cy}) rotate(-90)`} fontSize={FS} textAnchor="middle" fill={COLOR} fontFamily={FONT}>
            {t}
          </text>
        ) : null;
      })}
    </g>
  );
  return (
    <g pointerEvents="none">
      {hChain(xs, chainY, 'hc')}
      {hChain([b.x, b.x + b.w], totalY, 'ht')}
      {vChain(ys, chainX, 'vc')}
      {vChain([b.y, b.y + b.h], totalX, 'vt')}
    </g>
  );
}

export function FloorsDrawing({
  project,
  mode,
  showFixtures = true,
  showFurniture = true,
  dimensions = false,
  idPrefix = '',
}: {
  project: Project;
  mode: 'active' | 'all';
  showFixtures?: boolean;
  showFurniture?: boolean;
  dimensions?: boolean;
  idPrefix?: string;
}) {
  const { items, union } = layoutFloors(project, mode);
  const labeled = items.length > 1;
  const dimSpace = dimensions ? DIMENSION_SPACE : 0;
  return (
    <g>
      {items.map(({ floor, dx }) => (
        <g key={floor.id} transform={`translate(${dx} 0)`}>
          <PlanDrawing
            project={project}
            floorId={floor.id}
            showFixtures={showFixtures}
            idPrefix={`${idPrefix}${floor.id}-`}
            labelMode={dimensions ? 'dimensions' : 'normal'}
            overlay={showFurniture && <FurnitureLayer items={project.furniture.filter((f) => f.floorId === floor.id)} />}
          />
          {dimensions && <DimensionLines rooms={project.rooms.filter((r) => r.floorId === floor.id)} />}
          {labeled && (
            <text x={union.x - dimSpace} y={union.y - dimSpace - 380} fontSize={260} fontWeight={700} fill="#2d2a26" fontFamily={FONT}>
              {floor.name}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

/** 間取りを単独の SVG 文字列として生成する（PNG・PDF 出力の元データ） */
export async function buildSvg(
  project: Project,
  opts: ImageOptions,
): Promise<{ svg: string; width: number; height: number; scale: number; box: { w: number; h: number } }> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const layout = layoutFloors(project, opts.floors);
  const b = layout.bounds;
  const margin = 900;
  const labelH = layout.items.length > 1 ? 600 : 0;
  const dimSpace = opts.dimensions ? DIMENSION_SPACE : 0;
  const titleH = opts.showTitle ? 700 : 0;
  const box = {
    x: b.x - margin - dimSpace,
    y: b.y - margin - titleH - labelH - dimSpace,
    w: b.w + margin * 2 + dimSpace,
    h: b.h + margin * 2 + titleH + labelH + dimSpace,
  };
  let scale = opts.scale;
  if (box.w * scale > MAX_PIXELS || box.h * scale > MAX_PIXELS) scale = MAX_PIXELS / Math.max(box.w, box.h);
  const width = Math.round(box.w * scale);
  const height = Math.round(box.h * scale);
  const major = project.settings.majorGridSize;
  const gridLines: string[] = [];
  if (opts.showGrid) {
    for (let x = Math.ceil(box.x / major) * major; x <= box.x + box.w; x += major)
      gridLines.push(`M ${x} ${box.y} V ${box.y + box.h}`);
    for (let y = Math.ceil(box.y / major) * major; y <= box.y + box.h; y += major)
      gridLines.push(`M ${box.x} ${y} H ${box.x + box.w}`);
  }
  const planName = project.plans.length > 1 ? ` ${project.plans.find((pl) => pl.id === project.activePlanId)?.name ?? ''}` : '';
  const floorName =
    opts.floors === 'active' && project.floors.length > 1
      ? ` ${project.floors.find((f) => f.id === project.settings.activeFloorId)?.name ?? ''}`
      : '';
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
      {opts.background === 'white' && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#ffffff" />}
      {opts.showGrid && <path d={gridLines.join(' ')} stroke="#e2ddd2" strokeWidth={10} fill="none" />}
      <FloorsDrawing
        project={project}
        mode={opts.floors}
        showFixtures={opts.showFixtures}
        showFurniture={opts.showFurniture}
        dimensions={opts.dimensions}
      />
      {opts.showTitle && (
        <g fontFamily={FONT} fill="#2d2a26">
          <text x={box.x + margin} y={box.y + margin * 0.9} fontSize={300} fontWeight={700}>
            {project.projectName}
            {planName}
            {floorName}
          </text>
          {/* 縮尺バー（1m） */}
          <g transform={`translate(${b.x + b.w - 1000} ${box.y + margin * 0.6})`}>
            <rect x={0} y={0} width={1000} height={60} fill="#2d2a26" />
            <text x={500} y={-60} fontSize={160} textAnchor="middle">
              1m
            </text>
            {opts.caption && (
              <text x={1000} y={260} fontSize={170} textAnchor="end">
                {opts.caption}
              </text>
            )}
          </g>
        </g>
      )}
    </svg>,
  );
  return { svg: markup, width, height, scale, box: { w: box.w, h: box.h } };
}

/** SVG をキャンバスに描画する（PNG・PDF 用） */
export async function renderCanvas(project: Project, opts: ImageOptions): Promise<HTMLCanvasElement> {
  const { svg, width, height } = await buildSvg(project, opts);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('画像の生成に失敗しました。'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('この環境では画像を生成できません。');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderPng(project: Project, opts: ImageOptions): Promise<Blob> {
  const canvas = await renderCanvas(project, opts);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました。'))), 'image/png'),
  );
}

export async function exportPng(project: Project, opts: ImageOptions) {
  const blob = await renderPng(project, opts);
  downloadBlob(blob, `${safeFileName(project.projectName)}.png`);
}
