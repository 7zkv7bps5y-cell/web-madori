import { parseProject, PROJECT_EXTENSION, serializeProject, type ParseResult } from '../model/project';
import type { Project } from '../model/types';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * ファイル名に使える形に整える（日本語はそのまま使う）。
 * - OS で使えない記号・空白・制御文字は「_」に置き換え
 * - 先頭・末尾のドットや「_」を除く（Windows で末尾のドットは消えるため）
 * - Windows の予約名（CON など）は避ける
 * - 長すぎる名前は 60 文字（サロゲートペアを壊さない）で切る
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  const base = Array.from(cleaned).slice(0, 60).join('').replace(/[._]+$/g, '');
  if (!base || WINDOWS_RESERVED.test(base)) return base ? `${base}_madori` : 'madori';
  return base;
}

/**
 * ファイルをダウンロードさせる。
 * iOS Safari は「ダウンロードしますか？」の確認後に URL を読みに行くため、
 * URL をすぐに破棄すると保存に失敗する。そのため破棄まで十分に待つ。
 */
export const REVOKE_DELAY_MS = 60_000;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * .floorplan ファイルの MIME タイプ。
 * application/json にすると iOS などが拡張子 .json を付け足すことがあるため、汎用のバイナリとして渡す
 * （中身は従来どおりの JSON。読み込み側は拡張子・MIME に関係なく中身で判定する）。
 */
export const FLOORPLAN_MIME = 'application/octet-stream';

export function saveProjectFile(project: Project) {
  const blob = new Blob([serializeProject(project)], { type: FLOORPLAN_MIME });
  downloadBlob(blob, `${safeFileName(project.projectName)}${PROJECT_EXTENSION}`);
}

export function readProjectFile(file: File): Promise<ParseResult> {
  if (file.size > 5_000_000) return Promise.resolve({ ok: false, error: 'ファイルが大きすぎます（5MB まで）。' });
  return file.text().then(parseProject, () => ({ ok: false as const, error: 'ファイルを読み込めませんでした。' }));
}

/** クリップボードへ書き込む。失敗した場合は false（手動コピー用表示に切り替える） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText || !window.isSecureContext) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** クリップボードから読み取る。利用できない場合は null（手動貼り付け欄を表示する） */
export async function readText(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText || !window.isSecureContext) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

const AUTOSAVE_KEY = 'web-madori:autosave:v1';

export function autosave(project: Project): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(project, false));
    return true;
  } catch {
    return false;
  }
}

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const r = parseProject(text);
    return r.ok ? r.project : null;
  } catch {
    return null;
  }
}

/** iPhone / iPad（iPadOS の Safari は Mac として振る舞うためタッチ対応も見る） */
export function isIOS(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

/** LINE・Instagram・Facebook などのアプリ内ブラウザ（ファイルの保存ができないことが多い） */
export function inAppBrowserName(ua = navigator.userAgent): string | null {
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  if (/\bTwitter/i.test(ua)) return 'X（Twitter）';
  return null;
}

/**
 * 「開く」のファイル選択で絞り込む種類。
 * iOS は独自の拡張子（.floorplan）を種類として認識できず選べなくなることがあるため、絞り込まない
 * （読み込み時に中身で判定するので、別のファイルを選んでもエラーとして案内される）。
 */
export function projectFileAccept(ios = typeof navigator !== 'undefined' && isIOS()): string | undefined {
  return ios ? undefined : '.floorplan,.json,application/json,application/octet-stream';
}
