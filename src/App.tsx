import { useEffect, useRef, useState } from 'react';
import { AddRoomDialog } from './components/AddRoomDialog';
import { Canvas } from './components/Canvas';
import { ExportImageDialog, TextTransferDialog } from './components/Dialogs';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TopBar, type ProjectActions } from './components/TopBar';
import { openingDef } from './model/catalog';
import { serializeProject, parseProject } from './model/project';
import { TEMPLATES } from './model/templates';
import { useStore } from './store/store';
import { useView } from './store/view';
import { autosave, copyText, loadAutosave, readProjectFile, readText, saveProjectFile } from './utils/io';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div>
  );
}

function ZoomControls() {
  const zoomAt = useView((s) => s.zoomAt);
  const requestFit = useView((s) => s.requestFit);
  const zoom = useView((s) => s.zoom);
  return (
    <div className="zoom-controls">
      <button type="button" onClick={() => zoomAt(1 / 1.25)} aria-label="縮小">
        −
      </button>
      <span className="small">{Math.round(zoom * 1000)}%</span>
      <button type="button" onClick={() => zoomAt(1.25)} aria-label="拡大">
        ＋
      </button>
      <button type="button" onClick={requestFit} title="全体を表示">
        ⤢
      </button>
    </div>
  );
}

function PlacementBanner() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  if (tool.kind !== 'placeOpening') return null;
  return (
    <div className="banner">
      <span>
        <b>{openingDef(tool.type).label}</b>：取り付ける壁をクリック（タップ）してください
      </span>
      <button type="button" onClick={() => setTool({ kind: 'select' })}>
        やめる
      </button>
    </div>
  );
}

function EmptyState({ onTemplate }: { onTemplate: () => void }) {
  const count = useStore((s) => s.project.rooms.length);
  const open = useStore((s) => s.openAddDialog);
  if (count > 0) return null;
  return (
    <div className="empty">
      <div className="empty-card">
        <h2>間取りづくりを始めましょう</h2>
        <p>
          最初の部屋を置いたら、部屋を選んで上下左右の <b>＋</b> を押すだけで部屋を増やせます。
        </p>
        <div className="modal-actions center">
          <button type="button" className="primary" onClick={() => open({ baseId: null, dir: null })}>
            ＋ 最初の部屋を追加
          </button>
          <button type="button" onClick={onTemplate}>
            サンプル間取りを開く
          </button>
        </div>
      </div>
    </div>
  );
}

/** スマートフォン: 選択中オブジェクトのクイック操作 */
function MobileSelectionBar({ onDetail }: { onDetail: () => void }) {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  if (!selection) return null;
  const label =
    selection.kind === 'room'
      ? project.rooms.find((r) => r.id === selection.id)?.name
      : selection.kind === 'opening'
        ? openingDef(project.openings.find((o) => o.id === selection.id)?.type ?? 'door').label
        : '';
  return (
    <div className="mobile-selbar">
      <strong className="ellipsis">{label}</strong>
      {selection.kind === 'room' && (
        <button type="button" onClick={() => st.rotateRoom(selection.id)}>
          ↻
          <small>回転</small>
        </button>
      )}
      <button type="button" onClick={() => st.duplicateSelection()}>
        ⧉<small>複製</small>
      </button>
      <button type="button" className="danger" onClick={() => st.deleteSelection()}>
        🗑<small>削除</small>
      </button>
      <button type="button" className="primary" onClick={onDetail}>
        ⚙<small>詳細</small>
      </button>
    </div>
  );
}

export default function App() {
  const mobile = useMedia('(max-width: 820px)');
  const coarse = useMedia('(pointer: coarse)');
  const [sheet, setSheet] = useState<'none' | 'parts' | 'props'>('none');
  const [exportOpen, setExportOpen] = useState(false);
  const [transfer, setTransfer] = useState<{ mode: 'copy' | 'paste'; text?: string } | null>(null);
  const [saveState, setSaveState] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const selection = useStore((s) => s.selection);

  // 自動保存の復元
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) {
      useStore.getState().loadProject(saved, false);
      useView.getState().requestFit();
    }
  }, []);

  // 自動保存（変更から 0.8 秒後）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project === prev.project || s.dragBase) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ok = autosave(useStore.getState().project);
        setSaveState(ok ? 'ブラウザに自動保存済み' : '自動保存できませんでした');
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  const notify = useStore((s) => s.notify);
  const actions: ProjectActions = {
    newProject: () => {
      useStore.getState().newProject();
      useView.getState().requestFit();
      notify('新しい間取りを作成しました（元に戻すで前の間取りに戻せます）。');
    },
    openTemplate: () => {
      useStore.getState().loadProject(TEMPLATES[0].create());
      useView.getState().requestFit();
      notify('サンプル間取りを開きました。');
    },
    openFile: () => fileRef.current?.click(),
    saveFile: () => {
      saveProjectFile(useStore.getState().project);
      notify('ファイルを保存しました。');
    },
    copyJson: async () => {
      const text = serializeProject(useStore.getState().project, false);
      if (await copyText(text)) notify('間取りデータをクリップボードにコピーしました。');
      else setTransfer({ mode: 'copy', text });
    },
    pasteJson: async () => {
      const text = await readText();
      if (text === null) return setTransfer({ mode: 'paste' });
      const r = parseProject(text.trim());
      if (!r.ok) {
        notify(r.error, 'error');
        return setTransfer({ mode: 'paste' });
      }
      useStore.getState().loadProject(r.project);
      useView.getState().requestFit();
      notify('間取りを貼り付けました（元に戻すで戻せます）。');
    },
    exportImage: () => setExportOpen(true),
  };

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelection();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        actions.saveFile();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection) {
          e.preventDefault();
          st.deleteSelection();
        }
      } else if (e.key === 'Escape') {
        st.setTool({ kind: 'select' });
        st.select(null);
      } else if (e.key.toLowerCase() === 'r' && !mod && st.selection?.kind === 'room') {
        st.rotateRoom(st.selection.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 選択が外れたら設定シートを閉じる
  useEffect(() => {
    if (!selection && sheet === 'props') setSheet('none');
  }, [selection, sheet]);

  return (
    <div className={`app ${mobile ? 'is-mobile' : ''}`}>
      <TopBar actions={actions} compact={mobile} saveState={saveState} />
      <main className="workspace">
        {!mobile && (
          <aside className="sidebar left" aria-label="パーツ一覧">
            <Palette />
          </aside>
        )}
        <section className="stage">
          <Canvas touchUi={coarse || mobile} />
          <PlacementBanner />
          <EmptyState onTemplate={actions.openTemplate} />
          <ZoomControls />
        </section>
        {!mobile && (
          <aside className="sidebar right" aria-label="設定">
            <PropertiesPanel />
          </aside>
        )}
      </main>

      {mobile && (
        <>
          {sheet === 'none' && <MobileSelectionBar onDetail={() => setSheet('props')} />}
          {sheet !== 'none' && (
            <div className="sheet" role="dialog" aria-label={sheet === 'parts' ? 'パーツ一覧' : '設定'}>
              <div className="sheet-head">
                <strong>{sheet === 'parts' ? 'パーツ' : '設定'}</strong>
                <button type="button" onClick={() => setSheet('none')} aria-label="閉じる">
                  ✕
                </button>
              </div>
              <div className="sheet-body">
                {sheet === 'parts' ? <Palette onPicked={() => setSheet('none')} /> : <PropertiesPanel />}
              </div>
            </div>
          )}
          <nav className="bottombar" aria-label="ツールバー">
            <button type="button" className={sheet === 'parts' ? 'active' : ''} onClick={() => setSheet(sheet === 'parts' ? 'none' : 'parts')}>
              ＋<small>パーツ</small>
            </button>
            <button type="button" onClick={() => useStore.getState().undo()} disabled={!canUndo}>
              ↶<small>戻す</small>
            </button>
            <button type="button" onClick={() => useStore.getState().redo()} disabled={!canRedo}>
              ↷<small>やり直す</small>
            </button>
            <button type="button" onClick={() => useView.getState().requestFit()}>
              ⤢<small>全体</small>
            </button>
            <button type="button" className={sheet === 'props' ? 'active' : ''} onClick={() => setSheet(sheet === 'props' ? 'none' : 'props')}>
              ⚙<small>設定</small>
            </button>
          </nav>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".floorplan,.json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const r = await readProjectFile(file);
          if (!r.ok) return notify(r.error, 'error');
          useStore.getState().loadProject(r.project);
          useView.getState().requestFit();
          notify(`「${r.project.projectName}」を開きました。`);
        }}
      />
      <AddRoomDialog />
      {exportOpen && <ExportImageDialog onClose={() => setExportOpen(false)} />}
      {transfer && <TextTransferDialog mode={transfer.mode} text={transfer.text} onClose={() => setTransfer(null)} />}
      <Toast />
    </div>
  );
}
