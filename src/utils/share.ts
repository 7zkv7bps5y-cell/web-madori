/**
 * URL 共有: 間取りデータを圧縮して URL の「#」以降（フラグメント）に入れる。
 * フラグメントはブラウザからサーバーへ送信されないため、運営者のサーバーにデータは残らない。
 * 形式: #p=<種別><base64url>  種別 z = deflate-raw 圧縮 / j = 無圧縮 JSON（圧縮 API がない環境用）
 */
import { parseProject, serializeProject, type ParseResult } from '../model/project';
import type { Project } from '../model/types';

export const SHARE_PARAM = 'p';
/** これを超える URL は SNS・メッセージアプリで途切れる可能性がある */
export const SHARE_URL_WARN = 8000;
/** 受け付ける最大長（不正に大きなデータを避ける） */
export const SHARE_URL_MAX = 2_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** 共有用の最小 JSON（派生データの壁・接続は含めない。読み込み時に再計算される） */
export function compactJson(p: Project): string {
  const data = JSON.parse(serializeProject(p, false)) as { plans: { derived?: unknown }[] };
  for (const pl of data.plans) delete pl.derived;
  return JSON.stringify(data);
}

export async function encodeShare(p: Project): Promise<string> {
  const raw = new TextEncoder().encode(compactJson(p));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(raw);
}

export async function decodeShare(token: string): Promise<ParseResult> {
  if (token.length > SHARE_URL_MAX) return { ok: false, error: '共有データが大きすぎます。' };
  try {
    const kind = token[0];
    const bytes = fromBase64Url(token.slice(1));
    let raw: Uint8Array;
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') {
        return { ok: false, error: 'このブラウザは共有URLの読み込みに対応していません。最新のブラウザでお試しください。' };
      }
      raw = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (kind === 'j') {
      raw = bytes;
    } else {
      return { ok: false, error: '共有URLの形式が正しくありません。' };
    }
    return parseProject(new TextDecoder().decode(raw));
  } catch {
    return { ok: false, error: '共有URLを読み取れませんでした。URLが途中で切れていないか確認してください。' };
  }
}

export async function buildShareUrl(p: Project, base = `${window.location.origin}/editor/`): Promise<string> {
  return `${base}#${SHARE_PARAM}=${await encodeShare(p)}`;
}

/** location.hash から共有データを取り出す（なければ null） */
export function shareTokenFromHash(hash: string): string | null {
  const m = /^#?p=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}
