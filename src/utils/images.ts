/**
 * パーツの参考画像を、端末の写真から間取りデータに埋め込むための処理。
 * - JPEG・PNG・WebP・HEIC（端末が読める場合）を受け付け、長辺 1024px・約 200KB 以下の JPEG に変換する
 * - 変換（描き直し）で撮影場所などの Exif 情報は残らない
 * - SVG など画像以外・壊れたファイルは受け付けない
 */
import { planContents } from '../model/project';
import type { PartInfo, Project } from '../model/types';
import { MAX_EMBEDDED_IMAGE_CHARS } from '../model/project';

export const ACCEPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** 読み込む元ファイルの上限 */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** 1 つの間取り（全階・全案）に埋め込める画像の合計 */
export const MAX_EMBEDDED_TOTAL_BYTES = 1_500_000;
const MAX_SIDE = 1024;

/** base64 の data URL のおおよそのバイト数 */
export function dataUrlBytes(src: string): number {
  const i = src.indexOf(',');
  return Math.floor(((src.length - i - 1) * 3) / 4);
}

/** 間取り全体（全案）に埋め込まれた画像の合計バイト数 */
export function embeddedImageBytes(p: Project): number {
  let total = 0;
  const add = (info?: PartInfo) => {
    for (const im of info?.images ?? []) if (im.kind === 'embedded') total += dataUrlBytes(im.src);
  };
  for (const { content } of planContents(p)) {
    for (const x of [...content.rooms, ...content.openings, ...content.furniture, ...content.customParts]) add(x.info);
  }
  return total;
}

export class ImageError extends Error {}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('画像を読み込めませんでした（JPEG・PNG・WebP の画像を選んでください）。'));
    };
    img.src = url;
  });
}

/** 端末の画像ファイルを、埋め込み用の小さな JPEG（data URL）にする */
export async function embedImageFile(file: File): Promise<string> {
  if (!ACCEPT_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    throw new ImageError('この種類のファイルは使えません（JPEG・PNG・WebP の画像を選んでください）。');
  }
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError('ファイルが大きすぎます（20MB まで）。');
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new ImageError('画像を読み込めませんでした。');
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageError('この環境では画像を変換できません。');
    ctx.fillStyle = '#ffffff'; // 透明部分は白に
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.6]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= MAX_EMBEDDED_IMAGE_CHARS && url.startsWith('data:image/jpeg;base64,')) return url;
    }
    scale *= 0.75;
  }
  throw new ImageError('画像を小さくできませんでした。別の画像をお試しください。');
}
