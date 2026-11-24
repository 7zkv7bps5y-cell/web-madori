import { useEffect, useRef, useState } from 'react';
import { AddRoomDialog } from './components/AddRoomDialog';
import { Canvas, finishDraftShape } from './components/Canvas';
import { ExportImageDialog, ExportPdfDialog, TextTransferDialog } from './components/Dialogs';
import { SharingDialog } from './components/SharingDialog';
import { SHARE_TOKEN_RE } from './cloud/types';
import { decodeShare, shareTokenFromHash } from './utils/share';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { FloorTabs } from './components/FloorTabs';
import { GuideTour, guideDone } from './components/GuideTour';
import { PlansDialog } from './components/PlansDialog';
import { SaveDialog } from './components/SaveDialog';
import { ScrollArea } from './components/ScrollArea';
import { TemplatesDialog } from './components/TemplatesDialog';
import { applyAdsForPlan } from './site/ads';
import { currentPlan, useAccount } from './store/account';
import { CloudDialog } from './components/CloudDialog';
import { TopBar, type ProjectActions } from './components/TopBar';
import { furnitureDef } from './model/furnitureCatalog';
import { openingDef } from './model/catalog';
import { areaM2, formatArea } from './model/units';
import { copyProject, serializeProject, parseProject } from './model/project';
import { TEMPLATES } from './model/templates';
import { useStore } from './store/store';
import { MAX_ZOOM, MIN_ZOOM, useView, ZOOM_STEP, zoomPercent } from './store/view';
import { autosave, copyText, loadAutosave, projectFileAccept, readProjectFile, readText, saveProjectFile } from './utils/io';

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

function ZoomControls({ onHelp }: { onHelp: () => void }) {
  const zoomAt = useView((s) => s.zoomAt);
  const requestFit = useView((s) => s.requestFit);
  const zoom = useView((s) => s.zoom);
  const showRoomDims = useView((s) => s.showRoomDims);
  const pct = zoomPercent(zoom);
  return (
    <>
      {/* 表示倍率（実寸は変えない）。スマホでは左下にまとめる */}
      <div className="zoom-controls zoom-group" role="group" aria-label="表示倍率">
        <button type="button" onClick={() => zoomAt(1 / ZOOM_STEP)} aria-label="縮小" title="縮小" disabled={zoom <= MIN_ZOOM + 1e-9}>
          −
        </button>
        <span className="small zoom-pct" aria-live="polite" title="現在の表示倍率">
          {pct}%
        </span>
        <button type="button" onClick={() => zoomAt(ZOOM_STEP)} aria-label="拡大" title="拡大" disabled={zoom >= MAX_ZOOM - 1e-9}>
          ＋
        </button>
        <button type="button" className="zoom-reset" onClick={() => useView.getState().zoomReset()} title="表示倍率を 100% に戻す" aria-label="100% に戻す">
          100%
        </button>
        <button type="button" className="zoom-fit" onClick={requestFit} title="全体を表示" aria-label="全体を表示">
          ⤢
        </button>
      </div>
      <div className="zoom-controls aux-group">
        <button
          type="button"
          className={`dims-toggle ${showRoomDims ? 'active' : ''}`}
          onClick={() => useView.getState().set({ showRoomDims: !showRoomDims })}
          aria-pressed={showRoomDims}
          title="部屋の寸法・畳数・面積の表示を切り替え"
          aria-label="寸法表示の切り替え"
        >
          📏
        </button>
        <button type="button" className="help-btn" onClick={onHelp} title="操作ガイド" aria-label="操作ガイドを見る">
          ？
        </button>
      </div>
    </>
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

/** 多角形・自由描画でカスタムパーツを描いている間の案内 */
function DrawBanner() {
  const tool = useStore((s) => s.tool);
  const draft = useView((s) => s.draft);
  if (tool.kind !== 'drawShape') return null;
  const cancel = () => {
    useView.getState().set({ draft: [] });
    useStore.getState().setTool({ kind: 'select' });
  };
  return (
    <div className="banner draw-banner">
      {tool.shape === 'polygon' ? (
        <>
          <span>
            <b>多角形</b>：頂点を<span className="hint-pc">クリック</span>
            <span className="hint-touch">タップ</span>で置き、最初の点に戻るか「完成」で閉じます（{draft.length} 点）
          </span>
          <button type="button" className="primary" disabled={draft.length < 3} onClick={() => finishDraftShape('polygon')}>
            完成
          </button>
          <button type="button" disabled={draft.length === 0} onClick={() => useView.getState().set({ draft: draft.slice(0, -1) })}>
            1つ戻す
          </button>
        </>
      ) : (
        <span>
          <b>自由描画</b>：指やマウスでなぞって形を描きます（離すと完成）
        </span>
      )}
      <button type="button" onClick={cancel}>
        やめる
      </button>
    </div>
  );
}

function removeShareParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('share')) return;
  params.delete('share');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
}

/** 共有リンクで開いた間取りの案内（閲覧専用） */
function ViewerBanner({ onOpenCloud }: { onOpenCloud: () => void }) {
  const viewer = useStore((s) => s.viewer);
  const user = useAccount((s) => s.user);
  const busy = useAccount((s) => !!s.busy);
  if (!viewer) return null;
  const st = useStore.getState();
  const takeCopy = (copy: ReturnType<typeof copyProject>, message: string) => {
    useStore.getState().copyViewerToLocal(copy);
    removeShareParam();
    autosave(useStore.getState().project);
    st.notify(message);
  };
  return (
    <div className="viewer-banner" role="region" aria-label="閲覧専用の案内">
      <div className="viewer-title">
        <span className="viewer-tag">閲覧のみ</span>
        <strong className="ellipsis">共有された間取り「{viewer.name}」</strong>
      </div>
      <div className="viewer-actions">
        <button
          type="button"
          className="primary"
          aria-label="自分のデータとして保存"
          disabled={busy}
          onClick={async () => {
            if (!user) {
              st.notify('「自分のデータとして保存」するにはログインしてください。ログイン後にもう一度押してください。');
              return onOpenCloud();
            }
            const copy = copyProject(useStore.getState().project, viewer.name);
            const item = await useAccount.getState().saveNew(copy.projectName, copy);
            if (!item) {
              const err = useAccount.getState().error;
              return st.notify(err ?? '保存できませんでした。', 'error');
            }
            takeCopy(copy, `「${copy.projectName}」を自分のクラウド保存にコピーしました。自由に編集できます（元の間取りには影響しません）。`);
          }}
        >
          <span className="lbl-long">自分のデータとして保存</span>
          <span className="lbl-short">自分用に保存</span>
        </button>
        <button
          type="button"
          onClick={() =>
            takeCopy(copyProject(useStore.getState().project, viewer.name), 'この端末にコピーしました。自由に編集できます（元の間取りには影響しません）。')
          }
        >
          コピーして編集
        </button>
        <button
          type="button"
          className="viewer-close"
          aria-label="閉じる"
          onClick={() => {
            st.exitViewer();
            removeShareParam();
            useView.getState().requestFit();
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

/** 共有リンク（?share=トークン）で開いたときに、その間取りを閲覧モードで表示する */
async function openSharedLink(token: string) {
  const st = useStore.getState();
  if (!SHARE_TOKEN_RE.test(token)) {
    removeShareParam();
    return st.notify('共有リンクの形式が正しくありません。リンクを最後までコピーできているか確認してください。', 'error');
  }
  const acc = useAccount.getState();
  if (acc.mode === 'unconfigured') {
    removeShareParam();
    return st.notify('共有リンクは、この環境ではまだ使えません。', 'error');
  }
  const shared = await acc.loadShared(token);
  if (!shared) {
    removeShareParam();
    const err = useAccount.getState().error;
    useAccount.getState().clearError();
    return st.notify(err ?? 'この共有リンクは停止されたか、存在しません。', 'error');
  }
  useStore.getState().enterViewer(shared.project, { name: shared.name, token, updatedAt: shared.updatedAt });
  useView.getState().requestFit();
  st.notify(`共有された間取り「${shared.name}」を表示しています（閲覧のみ）。`);
}

/** 閲覧モードの左側（パーツ一覧の代わり） */
function ViewerSideNote() {
  return (
    <div className="props viewer-side">
      <h2>閲覧モード</h2>
      <p className="small">
        共有された間取りを表示しています。部屋・家具などを<span className="hint-pc">クリック</span>
        <span className="hint-touch">タップ</span>すると、登録された写真・リンク・メモを見られます。
      </p>
      <p className="muted small">編集するには、上の「自分のデータとして保存」か「コピーして編集」を押してください。元の間取りは変わりません。</p>
    </div>
  );
}

/** スマートフォン: 選択中オブジェクトのクイック操作 */
function MobileSelectionBar({ onDetail }: { onDetail: () => void }) {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const viewer = useStore((s) => !!s.viewer);
  const st = useStore.getState();
  if (!selection) return null;
  const custom = selection.kind === 'custom' ? project.customParts.find((c) => c.id === selection.id) : undefined;
  const label =
    selection.kind === 'room'
      ? project.rooms.find((r) => r.id === selection.id)?.name
      : selection.kind === 'opening'
        ? openingDef(project.openings.find((o) => o.id === selection.id)?.type ?? 'door').label
        : selection.kind === 'custom'
          ? custom?.name || 'カスタムパーツ'
          : project.furniture.find((f) => f.id === selection.id)?.name ?? furnitureDef('').label;
  const room = selection.kind === 'room' ? project.rooms.find((r) => r.id === selection.id) : undefined;
  const fur = selection.kind === 'furniture' ? project.furniture.find((f) => f.id === selection.id) : undefined;
  const detail = room
    ? `${formatArea(areaM2(room.w, room.h), 'tatami', project.settings.tatamiArea)}・${Math.round(room.w / 10)}×${Math.round(room.h / 10)}cm`
    : fur
      ? `${Math.round(fur.w / 10)}×${Math.round(fur.d / 10)}cm`
      : custom
        ? `${Math.round(custom.w / 10)}×${Math.round(custom.h / 10)}cm`
        : '';
  return (
    <div className="mobile-selbar">
      <div className="selbar-title">
        <strong className="ellipsis">{label}</strong>
        {detail && <span className="ellipsis small muted">{detail}</span>}
      </div>
      {!viewer && selection.kind !== 'opening' && (
        <button type="button" onClick={() => st.rotateSelection()}>
          ↻
          <small>回転</small>
        </button>
      )}
      {!viewer && (
        <>
          <button type="button" onClick={() => st.duplicateSelection()}>
            ⧉<small>複製</small>
          </button>
          <button type="button" className="danger" onClick={() => st.deleteSelection()}>
            🗑<small>削除</small>
          </button>
        </>
      )}
      <button type="button" className="primary" onClick={onDetail}>
        {viewer ? 'ⓘ' : '⚙'}
        <small>詳細</small>
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
  const [saveOpen, setSaveOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  // 初回だけ操作ガイドを表示（共有URLやテンプレートから開いた場合も同じ）
  const [guideOpen, setGuideOpen] = useState(() => !guideDone());
  const [shareOpen, setShareOpen] = useState(false);
  const mode = useStore((s) => s.mode);
  const [transfer, setTransfer] = useState<{ mode: 'copy' | 'paste'; text?: string } | null>(null);
  const [saveState, setSaveState] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const selection = useStore((s) => s.selection);
  const viewer = useStore((s) => !!s.viewer);

  // 自動保存の復元。?template=ID で開いた場合はそのテンプレートを読み込む（元に戻すで直前の間取りに戻せる）
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) useStore.getState().loadProject(saved, false);
    const params = new URLSearchParams(window.location.search);
    const tpl = TEMPLATES.find((t) => t.id === params.get('template'));
    if (tpl) {
      useStore.getState().loadProject(tpl.create(), !!saved);
      useStore.getState().notify(`テンプレート「${tpl.name}」を開きました。`);
      // 開いた直後の状態も自動保存しておく（編集前に再読み込みしても消えないように）
      autosave(useStore.getState().project);
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
        autosave(useStore.getState().project);
      });
    }
    // 共有リンク（?share=トークン）で開いた場合は閲覧モードで表示する（自分の間取りは裏で保持）
    const shareToken = params.get('share');
    if (shareToken) void openSharedLink(shareToken);
    // このアプリ用の指定（template / new / 共有 #p=）だけを URL から消す。
    // ログイン用リンクの code などは認証処理が読むので残す
    const own = ['template', 'new'];
    if (own.some((k) => params.has(k)) || token) {
      for (const k of own) params.delete(k);
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + (token ? '' : window.location.hash));
    }
    useView.getState().requestFit();
  }, []);

  // アカウント（クラウド保存・プラン）。プランが分かってから広告を出す（有料プランは広告なし）
  const accReady = useAccount((s) => s.ready);
  const accStatus = useAccount((s) => s.status);
  useEffect(() => {
    void useAccount
      .getState()
      .init()
      .then(() => {
        // ログイン用リンクの戻りでエラーがあった場合は知らせる（例: 期限切れ・別のブラウザで開いた）
        const err = useAccount.getState().error;
        if (err) useStore.getState().notify(err, 'error');
      });
  }, []);
  useEffect(() => {
    if (accReady) applyAdsForPlan(currentPlan(accStatus).showAds);
  }, [accReady, accStatus]);

  // 自動保存（変更から 0.8 秒後）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      // 閲覧モード（共有リンク）の間は、自分の自動保存を上書きしない
      if (s.project === prev.project || s.dragBase || s.viewer) return;
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
    openGuide: () => setGuideOpen(true),
    openSave: () => setSaveOpen(true),
    openCloud: () => setCloudOpen(true),
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
        if (!st.viewer) setSaveOpen(true);
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
      <ViewerBanner onOpenCloud={() => setCloudOpen(true)} />
      <main className="workspace">
        {!mobile && (
          <aside className="sidebar left" aria-label="パーツ一覧">
            <ScrollArea>
              {viewer ? <ViewerSideNote /> : <Palette />}
              {/* 広告枠（AdSense 設定時のみ表示。キャンバス内には置かない） */}
              <aside className="ad-slot" data-ad-slot="editor-sidebar" aria-label="広告" />
            </ScrollArea>
          </aside>
        )}
        <section className="stage">
          <Canvas touchUi={coarse || mobile} />
          <PlacementBanner />
          <DrawBanner />
          <FloorTabs />
          {!viewer && <EmptyState onTemplate={actions.openTemplate} />}
          <ZoomControls onHelp={() => setGuideOpen(true)} />
        </section>
        {!mobile && (
          <aside className="sidebar right" aria-label="設定">
            <ScrollArea>
              <PropertiesPanel />
            </ScrollArea>
          </aside>
        )}
        {/* スマートフォン: パーツ・設定のシート。作業領域の中に置くため、下部ツールバーとは重ならない */}
        {mobile && sheet !== 'none' && (
          <div className="sheet" role="dialog" aria-label={sheet === 'parts' ? 'パーツ一覧' : '設定'}>
            <div className="sheet-head">
              <strong>{sheet === 'parts' ? (mode === 'plan' ? 'パーツ（部屋・ドア・窓）' : '家具・家電') : viewer ? '情報（閲覧のみ）' : '設定'}</strong>
              <button type="button" onClick={() => setSheet('none')} aria-label="閉じる">
                ✕
              </button>
            </div>
            <ScrollArea className="sheet-body">
              {sheet === 'parts' ? <Palette onPicked={() => setSheet('none')} /> : <PropertiesPanel />}
            </ScrollArea>
          </div>
        )}
      </main>

      {mobile && (
        <>
          {sheet === 'none' && <MobileSelectionBar onDetail={() => setSheet('props')} />}
          <nav className="bottombar" aria-label="ツールバー">
            {!viewer && (
              <button type="button" className={sheet === 'parts' ? 'active' : ''} onClick={() => setSheet(sheet === 'parts' ? 'none' : 'parts')}>
                ＋<small>パーツ</small>
              </button>
            )}
            {!viewer && (
              <>
                <button type="button" onClick={() => useStore.getState().undo()} disabled={!canUndo}>
                  ↶<small>戻す</small>
                </button>
                <button type="button" onClick={() => useStore.getState().redo()} disabled={!canRedo}>
                  ↷<small>やり直す</small>
                </button>
              </>
            )}
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
              {viewer ? 'ⓘ' : '⚙'}
              <small>{viewer ? '情報' : '設定'}</small>
            </button>
          </nav>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={projectFileAccept()}
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
      {guideOpen && (
        <GuideTour
          touch={coarse || mobile}
          onClose={() => setGuideOpen(false)}
          onTemplate={() => setTemplatesOpen(true)}
        />
      )}
      {saveOpen && (
        <SaveDialog
          compact={mobile}
          onClose={() => setSaveOpen(false)}
          onOpenCloud={() => {
            setSaveOpen(false);
            setCloudOpen(true);
          }}
        />
      )}
      {cloudOpen && <CloudDialog onClose={() => setCloudOpen(false)} onOpenLocalSave={() => setSaveOpen(true)} />}
      {pdfOpen && <ExportPdfDialog onClose={() => setPdfOpen(false)} />}
      {shareOpen && (
        <SharingDialog
          onClose={() => setShareOpen(false)}
          onOpenCloud={() => {
            setShareOpen(false);
            setCloudOpen(true);
          }}
        />
      )}
      {plansOpen && <PlansDialog onClose={() => setPlansOpen(false)} />}
      {exportOpen && <ExportImageDialog onClose={() => setExportOpen(false)} />}
      {transfer && <TextTransferDialog mode={transfer.mode} text={transfer.text} onClose={() => setTransfer(null)} />}
      <Toast />
    </div>
  );
}
