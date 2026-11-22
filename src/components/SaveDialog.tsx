import { useEffect, useState } from 'react';
import { buildSvg } from '../utils/exportImage';
import { effectiveFormats, imageOptionsFor, IMAGE_KINDS, SAVE_FORMATS, saveBundle, type ImageKind, type SaveFormat } from '../utils/saveBundle';
import { useStore } from '../store/store';
import { inAppBrowserName } from '../utils/io';
import { Modal } from './Dialogs';

const KIND_LABEL: Record<ImageKind, string> = { basic: '基本', dimensions: '寸法付き', furniture: '家具付き' };

/** 保存前プレビュー（実際に出力する SVG をそのまま表示） */
function Preview({ project, kind }: { project: ReturnType<typeof useStore.getState>['project']; kind: ImageKind }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    buildSvg(project, { ...imageOptionsFor(kind), scale: 0.06 }).then(({ svg }) => {
      if (alive) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      alive = false;
    };
  }, [project, kind]);
  return <div className="save-preview">{src ? <img src={src} alt={`${KIND_LABEL[kind]}間取り図のプレビュー`} /> : <span className="muted small">作成中…</span>}</div>;
}

/** 保存・出力画面: 形式の選択（初期はすべて ON）・プレビュー・保存実行を 1 画面で */
export function SaveDialog({ onClose, compact }: { onClose: () => void; compact: boolean }) {
  // 画面を開いた時点のデータを 1 つだけ使う（全形式が同じ内容になる）
  const [project] = useState(() => useStore.getState().project);
  const notify = useStore((s) => s.notify);
  const [selected, setSelected] = useState<Set<SaveFormat>>(() => new Set(SAVE_FORMATS.map((f) => f.key)));
  const [tab, setTab] = useState<ImageKind>('basic');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formats = effectiveFormats(selected);
  const hasImage = IMAGE_KINDS.some((k) => selected.has(k));
  const toggle = (k: SaveFormat, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });
  const multiPlan = project.plans.length > 1;
  const activePlanName = project.plans.find((p) => p.id === project.activePlanId)?.name ?? '';
  const allPlanNames = project.plans.map((p) => p.name).join('・');
  const floors = project.floors.filter((f) => project.rooms.some((r) => r.floorId === f.id)).length;
  const inApp = inAppBrowserName();
  const empty = project.rooms.length === 0;

  return (
    <Modal title="保存・出力" onClose={onClose}>
      <p className="muted small">
        保存したい形式にチェックを入れて「保存する」を押してください。複数選ぶと ZIP ファイル 1 つにまとめて保存します。
      </p>
      {inApp && (
        <p className="save-warning" role="alert">
          {inApp} のアプリ内ブラウザでは、ファイルを保存できないことがあります。うまく保存できないときは、画面のメニューから「Safari で開く」「ブラウザで開く」を選んでから保存してください。
        </p>
      )}
      {/* 保存される範囲（複数案のときは、画像・PDF が編集中の案だけであることを明示） */}
      <div className={`save-scope ${multiPlan ? 'multi' : ''}`}>
        <h3>保存される範囲</h3>
        <dl>
          <dt>編集用データ</dt>
          <dd>{multiPlan ? `すべての案（${allPlanNames}）` : 'この間取りのすべて'}</dd>
          <dt>間取り図・PDF</dt>
          <dd>
            {multiPlan ? (
              <>
                編集中の案「<b>{activePlanName}</b>」のみ
              </>
            ) : (
              '編集中の間取り'
            )}
            {floors > 1 && `（${floors} つの階を横に並べて描きます）`}
          </dd>
        </dl>
        {multiPlan && (
          <p className="small">
            ほかの案の間取り図が必要なときは、この画面を閉じて上部の案の切り替え（{activePlanName} ▾）で案を選んでから、もう一度保存してください。
          </p>
        )}
      </div>
      <ul className="save-list">
        {SAVE_FORMATS.map((f) => {
          const disabled = (f.key === 'pdf' && !hasImage) || (f.key !== 'project' && empty);
          const checked = selected.has(f.key) && !disabled;
          return (
            <li key={f.key} className={disabled ? 'disabled' : ''}>
              <label className="save-item">
                <input type="checkbox" checked={checked} disabled={disabled || !!busy} onChange={(e) => toggle(f.key, e.target.checked)} />
                <span>
                  <strong>
                    {f.label}
                    {multiPlan && (
                      <span className={`scope-tag ${f.key === 'project' ? 'all' : ''}`}>
                        {f.key === 'project' ? 'すべての案' : activePlanName}
                      </span>
                    )}
                  </strong>
                  <span className="muted small">{f.description}</span>
                  {f.key === 'pdf' && !hasImage && <span className="small error">間取り図を 1 つ以上選ぶと作れます。</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {!empty && (
        <details className="save-preview-box" open={!compact}>
          <summary>保存前にプレビューを見る</summary>
          <div className="segmented" role="tablist" aria-label="プレビューする間取り図">
            {IMAGE_KINDS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <Preview project={project} kind={tab} />
        </details>
      )}

      {error && <p className="error small">{error}</p>}
      <div className="modal-actions">
        <span className="save-count muted small">{formats.length ? `${formats.length} 形式` : '形式が選ばれていません'}</span>
        <button type="button" onClick={onClose} disabled={!!busy}>
          閉じる
        </button>
        <button
          type="button"
          className="primary"
          disabled={formats.length === 0 || !!busy}
          onClick={async () => {
            setError(null);
            try {
              const r = await saveBundle(project, formats, (label) => setBusy(label));
              notify(r.zip ? `${r.count} つの形式を ZIP ファイルにまとめて保存しました。` : '保存しました。');
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : '保存に失敗しました。');
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy ? `作成中…（${busy}）` : formats.length > 1 ? 'まとめて保存する（ZIP）' : '保存する'}
        </button>
      </div>
    </Modal>
  );
}
