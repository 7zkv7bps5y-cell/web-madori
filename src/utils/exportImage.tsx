import { boundsOf } from '../model/geometry';
import type { Project } from '../model/types';
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
}

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  scale: 0.12,
  showGrid: false,
  background: 'white',
  showFixtures: true,
  showTitle: true,
  showFurniture: true,
};

const MAX_PIXELS = 8192;

/** 間取りを単独の SVG 文字列として生成する（PNG・将来の PDF 出力の元データ） */
export async function buildSvg(project: Project, opts: ImageOptions): Promise<{ svg: string; width: number; height: number }> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const floorId = project.settings.activeFloorId;
  const rooms = project.rooms.filter((r) => r.floorId === floorId);
  const b = boundsOf(rooms) ?? { x: 0, y: 0, w: 3640, h: 3640 };
  const margin = 900;
  const titleH = opts.showTitle ? 700 : 0;
  const box = { x: b.x - margin, y: b.y - margin - titleH, w: b.w + margin * 2, h: b.h + margin * 2 + titleH };
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
  const markup = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
    >
      {opts.background === 'white' && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#ffffff" />}
      {opts.showGrid && <path d={gridLines.join(' ')} stroke="#e2ddd2" strokeWidth={10} fill="none" />}
      <PlanDrawing
        project={project}
        floorId={floorId}
        showFixtures={opts.showFixtures}
        overlay={opts.showFurniture && <FurnitureLayer items={project.furniture.filter((f) => f.floorId === floorId)} />}
      />
      {opts.showTitle && (
        <g fontFamily="'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif" fill="#2d2a26">
          <text x={b.x} y={box.y + margin * 0.9} fontSize={300} fontWeight={700}>
            {project.projectName}
            {project.plans.length > 1 ? ` ${project.plans.find((pl) => pl.id === project.activePlanId)?.name ?? ''}` : ''}
          </text>
          {/* 縮尺バー（1m） */}
          <g transform={`translate(${b.x + b.w - 1000} ${box.y + margin * 0.6})`}>
            <rect x={0} y={0} width={1000} height={60} fill="#2d2a26" />
            <text x={500} y={-60} fontSize={160} textAnchor="middle">
              1m
            </text>
          </g>
        </g>
      )}
    </svg>,
  );
  return { svg: markup, width, height };
}

export async function renderPng(project: Project, opts: ImageOptions): Promise<Blob> {
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
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました。'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(project: Project, opts: ImageOptions) {
  const blob = await renderPng(project, opts);
  downloadBlob(blob, `${safeFileName(project.projectName)}.png`);
}
