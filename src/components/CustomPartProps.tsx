import { addToLibrary, CUSTOM_COLORS, CUSTOM_PATTERN_LABEL, CUSTOM_SHAPE_LABEL } from '../model/customParts';
import { CUSTOM_PATTERNS, type CustomPart, type CustomPattern } from '../model/types';
import { normalizeAngle, useStore } from '../store/store';
import { notifyLibraryChanged } from './CustomPartPalette';
import { NumberField, TextField, toUnit } from './fields';
import { PartInfoSection } from './PartInfo';

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {CUSTOM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch-btn ${value.toLowerCase() === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
          />
        ))}
        <input type="color" aria-label={`${label}を選ぶ`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/** カスタムパーツの設定（名前・大きさ・回転・色・枠線・透明度・模様・文字） */
export function CustomPartProps({ part }: { part: CustomPart }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const set = (patch: Partial<CustomPart>) => st.updateCustomPart(part.id, patch);
  const circle = part.shape === 'circle';
  return (
    <div className="props">
      <h2>{part.name}の設定</h2>
      <p className="muted small">カスタムパーツ（{CUSTOM_SHAPE_LABEL[part.shape]}）。ドラッグで移動、○で大きさ、↻で回転できます。</p>
      <TextField label="パーツ名" value={part.name} maxLength={60} onCommit={(v) => set({ name: v.trim() || CUSTOM_SHAPE_LABEL[part.shape] })} />

      <div className="props-group">
        <h3>大きさ・向き</h3>
        <div className="props-row">
          <NumberField
            label={circle ? '直径' : '幅'}
            value={toUnit(part.w, 'cm')}
            suffix="cm"
            min={1}
            onCommit={(v) => set(circle ? { w: Math.max(50, v * 10), h: Math.max(50, v * 10) } : { w: Math.max(50, v * 10) })}
          />
          {!circle && <NumberField label="高さ（奥行き）" value={toUnit(part.h, 'cm')} suffix="cm" min={1} onCommit={(v) => set({ h: Math.max(50, v * 10) })} />}
        </div>
        <div className="props-row">
          <NumberField label="回転" value={String(Math.round(part.rotation))} suffix="°" onCommit={(v) => set({ rotation: normalizeAngle(v) })} />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <div className="btn-group">
              <button type="button" onClick={() => set({ rotation: normalizeAngle(part.rotation - 90) })} aria-label="左に90度回転">
                ↺90°
              </button>
              <button type="button" onClick={() => set({ rotation: normalizeAngle(part.rotation + 90) })} aria-label="右に90度回転">
                ↻90°
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="props-group">
        <h3>見た目</h3>
        <ColorRow label="塗りの色" value={part.fill} onChange={(c) => set({ fill: c })} />
        <ColorRow label="枠線の色" value={part.stroke} onChange={(c) => set({ stroke: c })} />
        <div className="props-row">
          <label className="field">
            <span className="field-label">枠線の太さ（{Math.round(part.strokeWidth / 10)}cm）</span>
            <input type="range" min={0} max={200} step={5} value={part.strokeWidth} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field-label">不透明度（{Math.round(part.opacity * 100)}%）</span>
            <input type="range" min={0.1} max={1} step={0.05} value={part.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">模様</span>
          <select value={part.pattern} onChange={(e) => set({ pattern: e.target.value as CustomPattern })}>
            {CUSTOM_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {CUSTOM_PATTERN_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <TextField label="図形に書く文字（任意）" value={part.text ?? ''} maxLength={60} onCommit={(v) => set({ text: v.trim() || undefined })} />
        <label className="check">
          <input type="checkbox" checked={part.showName} onChange={(e) => set({ showName: e.target.checked })} />
          パーツ名を図形に表示する
        </label>
      </div>

      <PartInfoSection info={part.info} project={project} onChange={(i) => st.setPartInfo({ kind: 'custom', id: part.id }, i)} />

      <div className="actions">
        <button
          type="button"
          onClick={() => {
            if (addToLibrary(part)) {
              notifyLibraryChanged();
              st.notify(`「${part.name}」をマイパーツに保存しました。パーツ一覧から別の間取りでも使えます。`);
            } else st.notify('マイパーツがいっぱいです（100 件まで）。', 'error');
          }}
        >
          ☆ マイパーツに保存
        </button>
        <button type="button" onClick={() => st.duplicateCustomPart(part.id)}>
          ⧉ 複製
        </button>
        <button type="button" className="danger" onClick={() => st.deleteCustomPart(part.id)}>
          🗑 削除
        </button>
      </div>
    </div>
  );
}
