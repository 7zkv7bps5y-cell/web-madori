import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useView } from '../store/view';

export interface ProjectActions {
  newProject: () => void;
  openFile: () => void;
  saveFile: () => void;
  copyJson: () => void;
  pasteJson: () => void;
  exportImage: () => void;
  exportPdf: () => void;
  shareUrl: () => void;
  openTemplate: () => void;
  openPlans: () => void;
}

export function ModeTabs() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <div className="mode-tabs" role="tablist" aria-label="編集モード">
      <button type="button" role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>
        間取り作成
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'furniture'}
        className={mode === 'furniture' ? 'active' : ''}
        onClick={() => setMode('furniture')}
      >
        家具配置
      </button>
    </div>
  );
}

function PlanSelect({ onManage }: { onManage: () => void }) {
  const plans = useStore((s) => s.project.plans);
  const activeId = useStore((s) => s.project.activePlanId);
  const switchPlan = useStore((s) => s.switchPlan);
  return (
    <select
      className="plan-select"
      aria-label="間取り案"
      value={activeId}
      onChange={(e) => {
        if (e.target.value === '__manage') return onManage();
        switchPlan(e.target.value);
        useView.getState().requestFit();
      }}
    >
      {plans.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value="__manage">案の追加・比較…</option>
    </select>
  );
}

function Menu({ label, children, className = '' }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div className={`menu ${className}`} ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div className="menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function TopBar({ actions, compact, saveState }: { actions: ProjectActions; compact: boolean; saveState: string }) {
  const name = useStore((s) => s.project.projectName);
  const setName = useStore((s) => s.setProjectName);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);

  const fileItems = (
    <>
      <button role="menuitem" type="button" onClick={actions.newProject}>
        新規作成
      </button>
      <button role="menuitem" type="button" onClick={actions.openTemplate}>
        テンプレートから始める…
      </button>
      <button role="menuitem" type="button" onClick={actions.openPlans}>
        間取り案の管理・比較…
      </button>
      <button role="menuitem" type="button" onClick={actions.openFile}>
        ファイルを開く…
      </button>
      <button role="menuitem" type="button" onClick={actions.saveFile}>
        ファイルに保存（.floorplan）
      </button>
      <hr />
      <button role="menuitem" type="button" onClick={actions.exportImage}>
        画像（PNG）で保存…
      </button>
      <button role="menuitem" type="button" onClick={actions.exportPdf}>
        PDFで保存（印刷用）…
      </button>
      <button role="menuitem" type="button" onClick={actions.shareUrl}>
        共有用URLを作成…
      </button>
      <button role="menuitem" type="button" onClick={actions.copyJson}>
        間取りデータをコピー
      </button>
      <button role="menuitem" type="button" onClick={actions.pasteJson}>
        間取りデータを貼り付け
      </button>
      <hr />
      <a role="menuitem" href="/guide/" target="_blank" rel="noopener">
        使い方ガイド
      </a>
      <a role="menuitem" href="/">
        トップページへ
      </a>
    </>
  );

  return (
    <header className="topbar">
      <a className="logo" href="/" aria-label="Web間取り トップページ">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        {!compact && <span>Web間取り</span>}
      </a>
      <input
        className="project-name"
        value={text}
        maxLength={60}
        aria-label="プロジェクト名"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setName(text.trim() || '無題の間取り')}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <PlanSelect onManage={actions.openPlans} />
      {!compact && (
        <button type="button" onClick={actions.openPlans} title="A案・B案…を並べて比較">
          比較
        </button>
      )}
      {!compact && <span className="save-state muted small">{saveState}</span>}
      <div className="spacer" />
      {compact ? (
        <Menu label={<span aria-label="メニュー">☰</span>} className="right">
          {fileItems}
        </Menu>
      ) : (
        <>
          <div className="btn-group">
            <button type="button" onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
              ↶ 元に戻す
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)">
              ↷ やり直す
            </button>
          </div>
          <ModeTabs />
          <div className="btn-group">
            <button type="button" onClick={actions.openFile}>
              開く
            </button>
            <button type="button" className="primary" onClick={actions.saveFile} title="ファイルに保存 (Ctrl+S)">
              保存
            </button>
            <Menu label="出力 ▾" className="right">
              {fileItems}
            </Menu>
          </div>
        </>
      )}
    </header>
  );
}
