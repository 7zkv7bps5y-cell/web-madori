import { useEffect, useMemo, useRef, useState } from 'react';
import { ROOM_TYPE_DEFS, roomDef } from '../model/catalog';
import type { RoomType, Side } from '../model/types';
import { formatArea, formatMm, areaM2, sizeFromTatami } from '../model/units';
import { useStore } from '../store/store';
import { addRoomNearCenter } from './Canvas';
import { Segmented } from './fields';

type SizeMode = 'default' | 'tatami' | 'm' | 'cm';
const DIR_LABEL: Record<Side, string> = { top: '上', right: '右', bottom: '下', left: '左' };

export function AddRoomDialog() {
  const dialog = useStore((s) => s.addDialog);
  const settings = useStore((s) => s.project.settings);
  const close = useStore((s) => s.closeAddDialog);
  const [type, setType] = useState<RoomType>('room');
  const [mode, setMode] = useState<SizeMode>('default');
  const [tatami, setTatami] = useState('6');
  const [wide, setWide] = useState(false);
  const [wText, setWText] = useState('');
  const [hText, setHText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialog) {
      setMode('default');
      setWText('');
      setHText('');
      // 左右に追加する場合は横長を既定にする
      setWide(dialog.dir === 'left' || dialog.dir === 'right' ? false : true);
      setTimeout(() => ref.current?.querySelector<HTMLButtonElement>('.type-grid .active')?.focus(), 0);
    }
  }, [dialog]);

  const size = useMemo(() => {
    const def = roomDef(type);
    if (mode === 'tatami') {
      const t = Number(tatami);
      if (Number.isFinite(t) && t > 0 && t <= 200) return sizeFromTatami(t, settings.gridSize, settings.tatamiArea, wide);
      return null;
    }
    if (mode === 'm' || mode === 'cm') {
      const f = mode === 'm' ? 1000 : 10;
      const w = wText === '' ? def.w : Number(wText) * f;
      const h = hText === '' ? def.h : Number(hText) * f;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 100 || h < 100 || w > 100000 || h > 100000) return null;
      return { w, h };
    }
    return { w: def.w, h: def.h };
  }, [type, mode, tatami, wide, wText, hText, settings]);

  if (!dialog) return null;

  const submit = () => {
    if (!size) return;
    const st = useStore.getState();
    let ok: boolean;
    if (dialog.baseId && dialog.dir) ok = st.addRoomAdjacent(dialog.baseId, dialog.dir, type, size.w, size.h);
    else ok = addRoomNearCenter(type, { w: size.w, h: size.h, nextToSelection: false });
    if (ok) close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-room-title"
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <h2 id="add-room-title">{dialog.dir ? `${DIR_LABEL[dialog.dir]}側に部屋を追加` : '部屋を追加'}</h2>

        <h3>部屋の種類</h3>
        <div className="type-grid">
          {ROOM_TYPE_DEFS.map((d) => (
            <button
              key={d.type}
              type="button"
              className={d.type === type ? 'active' : ''}
              onClick={() => setType(d.type)}
              aria-pressed={d.type === type}
            >
              <span className="swatch" style={{ background: d.fill }} />
              {d.label}
            </button>
          ))}
        </div>

        <h3>広さ（未入力なら標準サイズ）</h3>
        <Segmented<SizeMode>
          ariaLabel="広さの指定方法"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'default', label: '標準' },
            { value: 'tatami', label: '畳数' },
            { value: 'm', label: 'm' },
            { value: 'cm', label: 'cm' },
          ]}
        />
        {mode === 'tatami' && (
          <div className="props-row">
            <label className="field">
              <span className="field-label">畳数</span>
              <span className="field-input">
                <input type="number" inputMode="decimal" min={0.5} step={0.5} value={tatami} onChange={(e) => setTatami(e.target.value)} />
                <span className="field-suffix">畳</span>
              </span>
            </label>
            <div className="field">
              <span className="field-label">向き</span>
              <Segmented
                value={wide ? 'wide' : 'tall'}
                onChange={(v) => setWide(v === 'wide')}
                options={[
                  { value: 'tall', label: '縦長' },
                  { value: 'wide', label: '横長' },
                ]}
              />
            </div>
          </div>
        )}
        {(mode === 'm' || mode === 'cm') && (
          <div className="props-row">
            {(
              [
                ['横幅', wText, setWText, roomDef(type).w],
                ['縦幅', hText, setHText, roomDef(type).h],
              ] as const
            ).map(([label, val, setter, def]) => (
              <label className="field" key={label}>
                <span className="field-label">{label}</span>
                <span className="field-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={val}
                    placeholder={String(mode === 'm' ? def / 1000 : def / 10)}
                    onChange={(e) => setter(e.target.value)}
                  />
                  <span className="field-suffix">{mode}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <h3>形状</h3>
        <Segmented
          value="rect"
          onChange={() => undefined}
          options={[
            { value: 'rect', label: '長方形' },
            { value: 'l', label: 'L字（今後対応）', disabled: true },
          ]}
        />

        <p className="preview">
          {size
            ? `横 ${formatMm(size.w)} × 縦 ${formatMm(size.h)} mm（${formatArea(areaM2(size.w, size.h), 'tatami', settings.tatamiArea)} / ${formatArea(areaM2(size.w, size.h), 'm2')}）`
            : '寸法を正しく入力してください'}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            キャンセル
          </button>
          <button type="button" className="primary" disabled={!size} onClick={submit}>
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}
