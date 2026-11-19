import { useEffect, useRef, useState } from 'react';
import { AddRoomDialog } from './components/AddRoomDialog';
import { Canvas } from './components/Canvas';
import { ExportImageDialog, ExportPdfDialog, ShareDialog, TextTransferDialog } from './components/Dialogs';
import { decodeShare, shareTokenFromHash } from './utils/share';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { FloorTabs } from './components/FloorTabs';
import { PlansDialog } from './components/PlansDialog';
import { TemplatesDialog } from './components/TemplatesDialog';
import { initAds } from './site/ads';
import { TopBar, type ProjectActions } from './components/TopBar';
import { furnitureDef } from './model/furnitureCatalog';
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
        <b>{openingDef(tool.type).label}</b>：取り付ける壁を<span className="hint-pc">クリック</span>
        <span className="hint-touch">タップ</span>してください
      </span>
      <button type="button" onClick={() => setTool({ kind: 'select' })}>
        やめる
      </button>
    </div>
  );
}

function EmptyState({ onTemplate }: { onTemplate: () => void }) {
  const count = useStore((s) => s.project.rooms.filter((r) => r.floorId === s.project.settings.activeFloorId).length);
  const floorName = useStore((s) => s.project.floors.find((f) => f.id === s.project.settings.activeFloorId)?.name ?? '');
  const hasOtherFloors = useStore((s) => s.project.rooms.length > 0);
  const open = useStore((s) => s.openAddDialog);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  if (count > 0) return null;
  if (mode === 'furniture') {
    return (
      <div className="empty">
        <div className="empty-card">
          <h2>先に間取りを作りましょう</h2>
          <p>家具は作成した間取りの上に配置します。家具だけを置いて寸法を確かめることもできます。</p>
          <div className="modal-actions center">
            <button type="button" className="primary" onClick={() => setMode('plan')}>
              間取り作成へ
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="empty-card">
        {hasOtherFloors ? (
          <>
            <h2>{floorName}の間取りを作りましょう</h2>
            <p>下の階を薄く表示しています。階段の位置を下の階と合わせると、上下の階がつながります。</p>
          </>
        ) : (
          <>
            <h2>間取りづくりを始めましょう</h2>
            <p>
              最初の部屋を置いたら、部屋を選んで上下左右の <b>＋</b> を押すだけで部屋を増やせます。
            </p>
          </>
        )}
        <div className="modal-actions center">
          <button type="button" className="primary" onClick={() => open({ baseId: null, dir: null })}>
            ＋ 最初の部屋を追加
          </button>
          {!hasOtherFloors && (
            <button type="button" onClick={onTemplate}>
              テンプレートから始める
            </button>
          )}
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
        : project.furniture.find((f) => f.id === selection.id)?.name ?? furnitureDef('').label;
  return (
    <div className="mobile-selbar">
      <strong className="ellipsis">{label}</strong>
      {selection.kind !== 'opening' && (
        <button type="button" onClick={() => st.rotateSelection()}>
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
  const [plansOpen, setPlansOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const mode = useStore((s) => s.mode);
  const [transfer, setTransfer] = useState<{ mode: 'copy' | 'paste'; text?: string } | null>(null);
  const [saveState, setSaveState] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const selection = useStore((s) => s.selection);

  // 自動保存の復元。?template=ID で開いた場合はそのテンプレートを読み込む（元に戻すで直前の間取りに戻せる）
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) useStore.getState().loadProject(saved, false);
    const params = new URLSearchParams(window.location.search);
    const tpl = TEMPLATES.find((t) => t.id === params.get('template'));
    if (tpl) {
      useStore.getState().loadProject(tpl.create(), !!saved);
      useStore.getState().notify(`テンプレート「${tpl.name}」を開きました。`);
    } else if (params.has('new') && saved && saved.rooms.length > 0) {
      useStore.getState().newProject();
    }
    // 共有URL（#p=...）で開いた場合は、その間取りのコピーを開く
    const token = shareTokenFromHash(window.location.hash);
    if (token) {
      decodeShare(token).then((r) => {
        if (!r.ok) return useStore.getState().notify(r.error, 'error');
        useStore.getState().loadProject(r.project, !!saved);
        useView.getState().requestFit();
        useStore.getState().notify(`共有された間取り「${r.project.projectName}」を開きました。${saved ? '（元に戻すで前の間取りに戻せます）' : ''}`);
      });
    }
    if (params.toString() || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    useView.getState().requestFit();
    initAds();
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
    openTemplate: () => setTemplatesOpen(true),
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
    openPlans: () => setPlansOpen(true),
    exportPdf: () => setPdfOpen(true),
    shareUrl: () => setShareOpen(true),
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
      } else if (e.key.toLowerCase() === 'r' && !mod) {
        st.rotateSelection();
      } else if (e.key.startsWith('Arrow') && st.selection?.kind === 'furniture') {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        const f = st.project.furniture.find((x) => x.id === st.selection!.id);
        if (!f) return;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.updateFurniture(f.id, { x: f.x + dx, y: f.y + dy });
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
            {/* 広告枠（AdSense 設定時のみ表示。キャンバス内には置かない） */}
            <aside className="ad-slot" data-ad-slot="editor-sidebar" aria-label="広告" />
          </aside>
        )}
        <section className="stage">
          <Canvas touchUi={coarse || mobile} />
          <PlacementBanner />
          <FloorTabs />
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
            <button
              type="button"
              onClick={() => {
                setSheet('none');
                useStore.getState().setMode(mode === 'plan' ? 'furniture' : 'plan');
              }}
            >
              {mode === 'plan' ? '🛋' : '📐'}
              <small>{mode === 'plan' ? '家具配置へ' : '間取りへ'}</small>
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
      {templatesOpen && (
        <TemplatesDialog
          onClose={() => setTemplatesOpen(false)}
          onPick={(id) => {
            const t = TEMPLATES.find((x) => x.id === id)!;
            useStore.getState().loadProject(t.create());
            useView.getState().requestFit();
            notify(`テンプレート「${t.name}」を開きました（元に戻すで戻せます）。`);
            setTemplatesOpen(false);
          }}
        />
      )}
      {pdfOpen && <ExportPdfDialog onClose={() => setPdfOpen(false)} />}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {plansOpen && <PlansDialog onClose={() => setPlansOpen(false)} />}
      {exportOpen && <ExportImageDialog onClose={() => setExportOpen(false)} />}
      {transfer && <TextTransferDialog mode={transfer.mode} text={transfer.text} onClose={() => setTransfer(null)} />}
      <Toast />
    </div>
  );
}
