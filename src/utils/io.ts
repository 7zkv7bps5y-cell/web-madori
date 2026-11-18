import { parseProject, PROJECT_EXTENSION, serializeProject, type ParseResult } from '../model/project';
import type { Project } from '../model/types';

export function safeFileName(name: string): string {
  return (name.trim() || 'madori').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveProjectFile(project: Project) {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
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
