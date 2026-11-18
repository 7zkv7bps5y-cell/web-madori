import { useMemo } from 'react';
import { boundsOf } from '../model/geometry';
import { materializePlan, MAX_PLANS } from '../model/project';
import { planStats } from '../model/stats';
import type { Project } from '../model/types';
import { formatArea } from '../model/units';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import { Modal } from './Dialogs';
import { TextField } from './fields';
import { FurnitureLayer } from './plan/FurnitureShape';
import { PlanDrawing } from './plan/PlanDrawing';

export function PlanThumbnail({ project, prefix }: { project: Project; prefix: string }) {
  const floorId = project.settings.activeFloorId;
  const b = boundsOf(project.rooms.filter((r) => r.floorId === floorId));
  if (!b) return <div className="thumb empty-thumb">部屋がありません</div>;
  const m = 600;
  return (
    <svg className="thumb" viewBox={`${b.x - m} ${b.y - m} ${b.w + m * 2} ${b.h + m * 2}`} role="img" aria-label="間取りのプレビュー">
      <PlanDrawing
        project={project}
        floorId={floorId}
        idPrefix={prefix}
        overlay={<FurnitureLayer items={project.furniture.filter((f) => f.floorId === floorId)} />}
      />
    </svg>
  );
}

/** 間取り案（A案・B案…）の管理と並べて比較 */
export function PlansDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const plans = useMemo(
    () =>
      project.plans.map((entry) => {
        const p = materializePlan(project, entry.id);
        return { entry, project: p, stats: planStats(p) };
      }),
    [project],
  );
  const unit = project.settings.areaUnit;
  return (
    <Modal title="間取り案の管理・比較" onClose={onClose} wide>
      <p className="muted small">
        1 つのプロジェクトに最大 {MAX_PLANS} 案まで保存できます。案を複製して少しずつ変えながら比べてみましょう。
      </p>
      <div className="plan-grid">
        {plans.map(({ entry, project: p, stats }) => {
          const active = entry.id === project.activePlanId;
          return (
            <article key={entry.id} className={`plan-card ${active ? 'active' : ''}`}>
              <div className="plan-card-head">
                <TextField label="案の名前" value={entry.name} maxLength={30} onCommit={(v) => st.renamePlan(entry.id, v)} />
                {active && <span className="badge">編集中</span>}
              </div>
              <PlanThumbnail project={p} prefix={`cmp-${entry.id}-`} />
              <dl className="plan-stats">
                <dt>間取り</dt>
                <dd>{stats.layout}</dd>
                <dt>部屋数</dt>
                <dd>{stats.roomCount}</dd>
                <dt>床面積</dt>
                <dd>
                  {formatArea(stats.totalArea, 'm2')}
                  {unit !== 'm2' && `（${formatArea(stats.totalArea, unit, project.settings.tatamiArea)}）`}
                </dd>
                <dt>家具</dt>
                <dd>
                  {stats.furnitureCount} 点{stats.warnings > 0 && <span className="error">（要確認 {stats.warnings}）</span>}
                </dd>
              </dl>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={active}
                  onClick={() => {
                    st.switchPlan(entry.id);
                    useView.getState().requestFit();
                    onClose();
                  }}
                >
                  {active ? '編集中' : 'この案を編集'}
                </button>
                <button
                  type="button"
                  disabled={project.plans.length >= MAX_PLANS}
                  onClick={() => {
                    if (!active) st.switchPlan(entry.id);
                    st.addPlan(true);
                  }}
                >
                  ⧉ 複製
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={project.plans.length <= 1}
                  onClick={() => {
                    if (window.confirm(`「${entry.name}」を削除しますか？（元に戻すで戻せます）`)) st.deletePlan(entry.id);
                  }}
                >
                  🗑 削除
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="modal-actions">
        <button type="button" disabled={project.plans.length >= MAX_PLANS} onClick={() => st.addPlan(false)}>
          ＋ 空の案を追加
        </button>
        <button type="button" disabled={project.plans.length >= MAX_PLANS} onClick={() => st.addPlan(true)}>
          ⧉ 編集中の案を複製
        </button>
        <button type="button" className="primary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
