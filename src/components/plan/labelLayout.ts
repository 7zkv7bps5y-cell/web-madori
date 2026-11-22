/**
 * 部屋ラベル（部屋名・広さ・寸法）の配置計算。
 * - 文字は常に水平。設備（浴槽など）が占める部分を避けた空き領域の中央に置く
 * - 部屋に収まるよう文字を縮め、それでも収まらなければ優先度の低い行から省く（小さい部屋は簡略化）
 * - 編集画面では画面上の px 基準（ズームしても読める大きさ）、画像出力では実寸 mm 基準
 */
import type { AreaUnit, Room } from '../../model/types';
import { areaM2, formatArea, formatMm } from '../../model/units';
import { fixtureDepth, localSize, localToWorld } from './Fixtures';

export type LabelMode = 'normal' | 'dimensions';

export interface LabelLine {
  text: string;
  /** 文字サイズ (mm) */
  size: number;
  weight: number;
  kind: 'name' | 'area' | 'dims';
}

export interface LabelLayout {
  x: number;
  /** 1 行目のベースライン */
  y: number;
  lines: (LabelLine & { dy: number })[];
}

export interface LabelOptions {
  mode: LabelMode;
  areaUnit: AreaUnit;
  tatamiArea: number;
  /** 編集画面: 1mm あたりの画面 px。省略時は画像出力（実寸 mm 基準） */
  zoom?: number;
}

const LINE_GAP = 1.28;

/** 文字列のおおよその幅（文字サイズ 1 あたり）。半角は 0.6、全角は 1.0 */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) < 0x2000 ? 0.6 : 1.0;
  return w;
}

/** 設備を避けた空き領域（ワールド座標の矩形） */
function freeRect(room: Room) {
  const { lw, lh } = localSize(room);
  const depth = room.style.showFixtures ? fixtureDepth(room.type, lh) : 0;
  const top = depth > 0 && lh - depth > lh * 0.3 ? depth : 0;
  const a = localToWorld(room, 0, top);
  const b = localToWorld(room, lw, lh);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function layoutRoomLabel(room: Room, o: LabelOptions): LabelLayout | null {
  const area = areaM2(room.w, room.h);
  const candidates: { kind: LabelLine['kind']; text: string; ratio: number; weight: number }[] = [];
  if (room.style.showLabel) candidates.push({ kind: 'name', text: room.name, ratio: 1, weight: 600 });
  const areaText =
    o.mode === 'dimensions'
      ? `${formatArea(area, 'tatami', o.tatamiArea)}・${formatArea(area, 'm2')}`
      : formatArea(area, o.areaUnit, o.tatamiArea);
  const dimsText = `${formatMm(room.w)}×${formatMm(room.h)}`;
  if (o.mode === 'dimensions') candidates.push({ kind: 'dims', text: dimsText, ratio: 0.8, weight: 500 });
  if (room.style.showArea || o.mode === 'dimensions') candidates.push({ kind: 'area', text: areaText, ratio: 0.8, weight: 400 });
  if (candidates.length === 0) return null;

  const editor = o.zoom !== undefined && o.zoom > 0;
  const px = (n: number) => (editor ? n / o.zoom! : n);
  // 余白（壁の厚み＋すき間）
  const pad = editor ? Math.max(90, px(4)) : 110;
  let free = freeRect(room);
  if (free.w - pad * 2 <= 0 || free.h - pad * 2 <= 0) free = { x: room.x, y: room.y, w: room.w, h: room.h };
  const availW = free.w - pad * 2;
  const availH = free.h - pad * 2;
  if (availW <= 0 || availH <= 0) return null;

  // 基準の文字サイズ
  const preferred = editor
    ? px(Math.max(10, Math.min(14, (Math.min(room.w, room.h) * o.zoom!) / 6)))
    : Math.max(110, Math.min(220, Math.min(room.w, room.h) / 5.5));
  const minSize = editor ? px(8.5) : 75;

  let lines = candidates;
  while (lines.length > 0) {
    const widest = Math.max(...lines.map((l) => textWidth(l.text) * l.ratio));
    const fs = Math.min(preferred, availW / widest);
    const height = lines.reduce((s, l) => s + l.ratio * fs * LINE_GAP, 0);
    if (fs >= minSize && height <= availH) {
      let dy = 0;
      const placed = lines.map((l, i) => {
        if (i > 0) dy += ((lines[i - 1].ratio + l.ratio) / 2) * fs * LINE_GAP;
        return { kind: l.kind, text: l.text, size: l.ratio * fs, weight: l.weight, dy };
      });
      const total = placed[placed.length - 1].dy;
      // 行の塊の中心を空き領域の中心に合わせる（ベースライン補正 0.35）
      const cx = free.x + free.w / 2;
      const cy = free.y + free.h / 2 - total / 2 + placed[0].size * 0.35;
      return { x: cx, y: cy, lines: placed };
    }
    lines = lines.slice(0, -1);
  }
  return null;
}
