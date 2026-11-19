import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseProject } from '../model/project';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import { DEFAULT_IMAGE_OPTIONS, exportPng, type ImageOptions } from '../utils/exportImage';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ExportImageDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const notify = useStore((s) => s.notify);
  const [opts, setOpts] = useState<ImageOptions>(DEFAULT_IMAGE_OPTIONS);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ImageOptions>) => setOpts((o) => ({ ...o, ...patch }));
  return (
    <Modal title="画像（PNG）で保存" onClose={onClose}>
      <div className="checks column">
        <label className="field">
          <span className="field-label">解像度</span>
          <select value={opts.scale} onChange={(e) => set({ scale: Number(e.target.value) })}>
            <option value={0.08}>小（SNS・メール向け）</option>
            <option value={0.12}>標準</option>
            <option value={0.25}>高解像度（印刷向け）</option>
          </select>
        </label>
        {project.floors.length > 1 && (
          <label className="field">
            <span className="field-label">出力する階</span>
            <select value={opts.floors} onChange={(e) => set({ floors: e.target.value as ImageOptions['floors'] })}>
              <option value="all">すべての階を並べる</option>
              <option value="active">編集中の階のみ</option>
            </select>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={opts.background === 'white'} onChange={(e) => set({ background: e.target.checked ? 'white' : 'transparent' })} />
          背景を白にする（オフで透明）
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} />
          グリッドを表示
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.showFixtures} onChange={(e) => set({ showFixtures: e.target.checked })} />
          設備（浴槽・便器など）を表示
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.showTitle} onChange={(e) => set({ showTitle: e.target.checked })} />
          タイトルと縮尺を表示
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.showFurniture} onChange={(e) => set({ showFurniture: e.target.checked })} />
          家具・家電を含める（オフで間取りのみ）
        </label>
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          閉じる
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || project.rooms.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await exportPng(project, opts);
              notify('画像を保存しました。');
              onClose();
            } catch (e) {
              notify(e instanceof Error ? e.message : '画像の保存に失敗しました。', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '作成中…' : 'PNGを保存'}
        </button>
      </div>
    </Modal>
  );
}

/** Clipboard API が使えない環境向けの手動コピー／貼り付け */
export function TextTransferDialog({ mode, text, onClose }: { mode: 'copy' | 'paste'; text?: string; onClose: () => void }) {
  const [value, setValue] = useState(text ?? '');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (mode === 'copy') ref.current?.select();
  }, [mode]);
  return (
    <Modal title={mode === 'copy' ? '間取りデータをコピー' : '間取りデータを貼り付け'} onClose={onClose}>
      <p className="muted small">
        {mode === 'copy'
          ? '自動でコピーできなかったため、下のテキストをすべて選択してコピーしてください。別の端末やブラウザで「貼り付け」すると間取りを復元できます。'
          : 'コピーした間取りデータ（JSON）を下に貼り付けて「読み込む」を押してください。現在の間取りは置き換わります（元に戻すで戻せます）。'}
      </p>
      <textarea
        ref={ref}
        className="transfer"
        value={value}
        readOnly={mode === 'copy'}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      {error && <p className="error small">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          閉じる
        </button>
        {mode === 'paste' && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              const r = parseProject(value.trim());
              if (!r.ok) return setError(r.error);
              useStore.getState().loadProject(r.project);
              useView.getState().requestFit();
              useStore.getState().notify('間取りを読み込みました。');
              onClose();
            }}
          >
            読み込む
          </button>
        )}
      </div>
    </Modal>
  );
}
