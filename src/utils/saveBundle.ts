/**
 * まとめて保存（編集用データ・間取り図・寸法付き間取り図・家具付き間取り図・PDF）。
 * データの整合性のため、すべての出力は「保存ボタンを押した時点の 1 つのプロジェクト」から生成する。
 * 画像ごとに別のデータを持たず、編集用データ（.floorplan）と同じ内容から描画する。
 */
import { serializeProject } from '../model/project';
import type { Project } from '../model/types';
import { buildSvg, renderCanvas, type ImageOptions } from './exportImage';
import { planPage } from './exportPdf';
import { downloadBlob, FLOORPLAN_MIME, safeFileName } from './io';
import { createZip } from './zip';

export type ImageKind = 'basic' | 'dimensions' | 'furniture';
export type SaveFormat = 'project' | ImageKind | 'pdf';

export interface SaveFormatDef {
  key: SaveFormat;
  label: string;
  description: string;
  /** ZIP 内のファイル名 */
  zipName: string;
  /** 単独で保存するときの接尾辞（プロジェクト名の後ろ） */
  suffix: string;
}

export const SAVE_FORMATS: SaveFormatDef[] = [
  {
    key: 'project',
    label: '編集用データ（.floorplan）',
    description: '「開く」で読み込むと、部屋・ドア・窓・家具・階・案・設定をそのまま再編集できます。',
    zipName: 'project.floorplan',
    suffix: '.floorplan',
  },
  {
    key: 'basic',
    label: '基本間取り図（PNG）',
    description: '部屋の形・配置と部屋名・広さを描いた間取り図です。',
    zipName: 'floorplan.png',
    suffix: '.png',
  },
  {
    key: 'dimensions',
    label: '寸法付き間取り図（PNG）',
    description: '部屋ごとの横×縦の寸法・畳数・面積と、外周の寸法線を描いた間取り図です。',
    zipName: 'floorplan_dimensions.png',
    suffix: '_寸法.png',
  },
  {
    key: 'furniture',
    label: '家具配置付き間取り図（PNG）',
    description: '配置した家具・家電を含めた間取り図です。',
    zipName: 'floorplan_furniture.png',
    suffix: '_家具.png',
  },
  {
    key: 'pdf',
    label: 'PDF（印刷用）',
    description: '選んだ間取り図を A4 に 1 枚ずつまとめた PDF です。',
    zipName: 'floorplan.pdf',
    suffix: '.pdf',
  },
];

export const IMAGE_KINDS: ImageKind[] = ['basic', 'dimensions', 'furniture'];

/** 各間取り図の描画設定。違いは「寸法を描くか」「家具を描くか」だけで、間取りの形・位置は共通 */
export function imageOptionsFor(kind: ImageKind): ImageOptions {
  return {
    scale: 0.12,
    showGrid: false,
    background: 'white',
    showFixtures: true,
    showTitle: true,
    floors: 'all',
    showFurniture: kind === 'furniture',
    dimensions: kind === 'dimensions',
  };
}

/** 選択の正規化（PDF は間取り図が 1 つ以上選ばれているときだけ有効） */
export function effectiveFormats(selected: Iterable<SaveFormat>): SaveFormat[] {
  const set = new Set(selected);
  if (!IMAGE_KINDS.some((k) => set.has(k))) set.delete('pdf');
  return SAVE_FORMATS.map((f) => f.key).filter((k) => set.has(k));
}

export interface BundleFile {
  format: SaveFormat;
  zipName: string;
  fileName: string;
  data: Uint8Array;
}

const PDF_PX_PER_MM = 8;

async function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました。'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** 選ばれた形式のファイルをすべて生成する（同一のプロジェクトから） */
export async function buildBundle(
  project: Project,
  selected: Iterable<SaveFormat>,
  onProgress?: (label: string) => void,
): Promise<BundleFile[]> {
  const formats = effectiveFormats(selected);
  const base = safeFileName(project.projectName);
  // 複数案があるときは、編集中の案だけを描く画像・PDF のファイル名に案の名前を付ける
  const activePlan = project.plans.find((pl) => pl.id === project.activePlanId)?.name;
  const imageBase = project.plans.length > 1 && activePlan ? safeFileName(`${project.projectName}_${activePlan}`) : base;
  const def = (k: SaveFormat) => SAVE_FORMATS.find((f) => f.key === k)!;
  const files: BundleFile[] = [];
  const pdfPages: { canvas: HTMLCanvasElement; plan: NonNullable<ReturnType<typeof planPage>> }[] = [];

  for (const key of formats) {
    const d = def(key);
    onProgress?.(d.label);
    if (key === 'project') {
      files.push({ format: key, zipName: d.zipName, fileName: base + d.suffix, data: new TextEncoder().encode(serializeProject(project)) });
    } else if (key !== 'pdf') {
      const canvas = await renderCanvas(project, imageOptionsFor(key));
      files.push({ format: key, zipName: d.zipName, fileName: imageBase + d.suffix, data: await canvasBytes(canvas) });
    }
  }

  if (formats.includes('pdf')) {
    const d = def('pdf');
    onProgress?.(d.label);
    for (const kind of IMAGE_KINDS.filter((k) => formats.includes(k))) {
      const opts = { ...imageOptionsFor(kind), scale: 0.01 };
      const { box } = await buildSvg(project, opts);
      const plan = planPage(box, 'a4', 'fit')!;
      pdfPages.push({ canvas: await renderCanvas(project, { ...opts, scale: plan.ratio * PDF_PX_PER_MM }), plan });
    }
    const { jsPDF } = await import('jspdf');
    let doc: InstanceType<typeof jsPDF> | null = null;
    for (const { canvas, plan } of pdfPages) {
      if (!doc) doc = new jsPDF({ orientation: plan.orientation, unit: 'mm', format: 'a4' });
      else doc.addPage('a4', plan.orientation);
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - plan.w) / 2, (ph - plan.h) / 2, plan.w, plan.h);
    }
    if (doc) {
      doc.setProperties({ title: project.projectName, creator: 'Web間取り' });
      files.push({ format: 'pdf', zipName: d.zipName, fileName: imageBase + d.suffix, data: new Uint8Array(doc.output('arraybuffer')) });
    }
  }
  return files;
}

const MIME: Record<SaveFormat, string> = {
  project: FLOORPLAN_MIME,
  basic: 'image/png',
  dimensions: 'image/png',
  furniture: 'image/png',
  pdf: 'application/pdf',
};

/** 1 つなら単独のファイル、複数なら ZIP にまとめて 1 回でダウンロード */
export async function saveBundle(project: Project, selected: Iterable<SaveFormat>, onProgress?: (label: string) => void) {
  const files = await buildBundle(project, selected, onProgress);
  if (files.length === 0) throw new Error('保存する形式を 1 つ以上選んでください。');
  if (files.length === 1) {
    const f = files[0];
    downloadBlob(new Blob([f.data as BlobPart], { type: MIME[f.format] }), f.fileName);
    return { zip: false, count: 1 };
  }
  onProgress?.('ZIP にまとめています');
  const zip = createZip(files.map((f) => ({ name: f.zipName, data: f.data })));
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safeFileName(project.projectName)}.zip`);
  return { zip: true, count: files.length };
}
