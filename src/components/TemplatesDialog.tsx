import { useMemo } from 'react';
import { planStats } from '../model/stats';
import { TEMPLATES } from '../model/templates';
import { formatArea } from '../model/units';
import { Modal } from './Dialogs';
import { PlanThumbnail } from './PlansDialog';

/** エディタ内のテンプレート選択 */
export function TemplatesDialog({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const items = useMemo(() => TEMPLATES.map((t) => ({ t, p: t.create() })), []);
  return (
    <Modal title="テンプレートから始める" onClose={onClose} wide>
      <p className="muted small">選んだテンプレートを元に自由に編集できます。今の間取りは「元に戻す」で戻せます。</p>
      <div className="plan-grid">
        {items.map(({ t, p }) => {
          const st = planStats(p);
          return (
            <button key={t.id} type="button" className="plan-card template-pick" onClick={() => onPick(t.id)}>
              <PlanThumbnail project={p} prefix={`tpl-${t.id}-`} />
              <strong>{t.name}</strong>
              <span className="muted small">
                {formatArea(st.totalArea, 'm2')}・{t.description}
              </span>
            </button>
          );
        })}
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
