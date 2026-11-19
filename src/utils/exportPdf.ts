import { sortedFloors } from '../model/project';
import type { Project } from '../model/types';
import { buildSvg, renderCanvas, type ImageOptions } from './exportImage';
import { downloadBlob, safeFileName } from './io';

export type PaperSize = 'a4' | 'a3';
/** fit = 用紙に合わせる / 数値 = 縮尺の分母（100 → 1/100） */
export type PdfScale = 'fit' | 50 | 100;

export interface PdfOptions {
  paper: PaperSize;
  scale: PdfScale;
  /** perFloor = 1 階ごとに 1 ページ / together = 全階を 1 ページ */
  pages: 'perFloor' | 'together';
  showFurniture: boolean;
  showFixtures: boolean;
  showGrid: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  paper: 'a4',
  scale: 'fit',
  pages: 'perFloor',
  showFurniture: true,
  showFixtures: true,
  showGrid: false,
};

const PAPER_MM: Record<PaperSize, [number, number]> = { a4: [297, 210], a3: [420, 297] };
const MARGIN = 10;
/** 用紙 1mm あたりの画像ピクセル数（約 200dpi） */
const PX_PER_PAPER_MM = 8;

export interface PdfPagePlan {
  floorId: string | null;
  orientation: 'landscape' | 'portrait';
  /** 用紙上の画像サイズ(mm) */
  w: number;
  h: number;
  /** 描画の縮尺（用紙 mm / 実寸 mm） */
  ratio: number;
}

/**
 * 各ページの向き・サイズを決める（縮尺指定で用紙に収まらなければ null）。
 * box は図面（余白・タイトル込み）の実寸 mm。
 */
export function planPage(box: { w: number; h: number }, paper: PaperSize, scale: PdfScale): Omit<PdfPagePlan, 'floorId'> | null {
  const [long, short] = PAPER_MM[paper];
  const candidates = (['landscape', 'portrait'] as const).map((orientation) => {
    const pw = (orientation === 'landscape' ? long : short) - MARGIN * 2;
    const ph = (orientation === 'landscape' ? short : long) - MARGIN * 2;
    const ratio = scale === 'fit' ? Math.min(pw / box.w, ph / box.h) : 1 / scale;
    return { orientation, ratio, w: box.w * ratio, h: box.h * ratio, fits: box.w * ratio <= pw + 0.01 && box.h * ratio <= ph + 0.01 };
  });
  const ok = candidates.filter((c) => c.fits);
  if (ok.length === 0) return null;
  // 用紙に合わせる場合は大きく描ける向き、縮尺指定なら横向きを優先
  const best = scale === 'fit' ? ok.sort((a, b) => b.ratio - a.ratio)[0] : ok[0];
  return { orientation: best.orientation, w: best.w, h: best.h, ratio: best.ratio };
}

export async function exportPdf(project: Project, opts: PdfOptions): Promise<void> {
  const floors = sortedFloors(project).filter((f) => project.rooms.some((r) => r.floorId === f.id));
  const targets: (string | null)[] = opts.pages === 'together' || floors.length <= 1 ? [null] : floors.map((f) => f.id);
  const caption = opts.scale === 'fit' ? undefined : `縮尺 1/${opts.scale}（${opts.paper.toUpperCase()}）`;
  const base: ImageOptions = {
    scale: 0.01,
    background: 'white',
    showGrid: opts.showGrid,
    showFixtures: opts.showFixtures,
    showFurniture: opts.showFurniture,
    showTitle: true,
    floors: 'all',
    caption,
  };
  const pages: { canvas: HTMLCanvasElement; plan: Omit<PdfPagePlan, 'floorId'> }[] = [];
  for (const floorId of targets) {
    const view: Project = floorId ? { ...project, settings: { ...project.settings, activeFloorId: floorId } } : project;
    const o: ImageOptions = { ...base, floors: floorId ? 'active' : 'all' };
    const { box } = await buildSvg(view, o);
    const plan = planPage(box, opts.paper, opts.scale);
    if (!plan) {
      throw new Error(
        `縮尺 1/${opts.scale} では ${opts.paper.toUpperCase()} の用紙に収まりません。用紙を大きくするか「用紙に合わせる」を選んでください。`,
      );
    }
    const canvas = await renderCanvas(view, { ...o, scale: plan.ratio * PX_PER_PAPER_MM });
    pages.push({ canvas, plan });
  }
  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const { canvas, plan } of pages) {
    if (!doc) doc = new jsPDF({ orientation: plan.orientation, unit: 'mm', format: opts.paper });
    else doc.addPage(opts.paper, plan.orientation);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    // 縮尺を保つため、画像は計算どおりの実寸で中央に置く
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - plan.w) / 2, (ph - plan.h) / 2, plan.w, plan.h);
  }
  if (!doc) return;
  doc.setProperties({ title: project.projectName, creator: 'Web間取り' });
  downloadBlob(doc.output('blob'), `${safeFileName(project.projectName)}.pdf`);
}
