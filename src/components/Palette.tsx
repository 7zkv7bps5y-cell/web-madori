import { OPENING_TYPE_DEFS, ROOM_TYPE_DEFS, type RoomTypeDef } from '../model/catalog';
import type { OpeningType } from '../model/types';
import { useStore } from '../store/store';
import { FURNITURE_CATEGORIES, FURNITURE_DEFS } from '../model/furnitureCatalog';
import { CustomPartPalette } from './CustomPartPalette';
import { addFurnitureNearCenter, addRoomNearCenter, FURNITURE_DRAG_MIME, ROOM_DRAG_MIME } from './Canvas';

function FurniturePalette({ onPicked }: { onPicked?: () => void }) {
  return (
    <div className="palette">
      <p className="palette-hint">
        <span className="hint-pc">クリックで画面中央に追加（キャンバスへドラッグでも配置できます）。</span>
        <span className="hint-touch">タップで画面中央に追加します。</span>
        サイズは標準的な実寸です。後から変更できます。
      </p>
      {FURNITURE_CATEGORIES.map((c) => (
        <section key={c.key} className="palette-section">
          <h3>{c.label}</h3>
          <div className="palette-grid">
            {FURNITURE_DEFS.filter((d) => d.category === c.key).map((d) => (
              <button
                key={d.type}
                type="button"
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(FURNITURE_DRAG_MIME, d.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => {
                  addFurnitureNearCenter(d.type);
                  onPicked?.();
                }}
                title={`${d.label}（幅${d.w / 10}×奥行${d.d / 10}cm）`}
              >
                <span className="swatch" style={{ background: d.fill }} />
                <span className="palette-label">
                  {d.label}
                  <small>
                    {d.w / 10}×{d.d / 10}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <CustomPartPalette onPicked={onPicked} />
    </div>
  );
}

const GROUPS: { key: RoomTypeDef['group']; label: string }[] = [
  { key: 'main', label: '部屋' },
  { key: 'water', label: '水回り' },
  { key: 'other', label: '玄関・収納・その他' },
];

function OpeningIcon({ type }: { type: OpeningType }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
  switch (type) {
    case 'entranceDoor':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M2 20h4M18 20h4" {...s} strokeWidth={3} />
          <path d="M6 20V6" {...s} strokeWidth={3} />
          <path d="M6 6a14 14 0 0 1 12 14" {...s} strokeDasharray="2 2" />
        </svg>
      );
    case 'door':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M2 20h4M18 20h4" {...s} strokeWidth={3} />
          <path d="M6 20V8" {...s} />
          <path d="M6 8a12 12 0 0 1 12 12" {...s} strokeDasharray="2 2" />
        </svg>
      );
    case 'slidingDoor':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M1 12h3M20 12h3" {...s} strokeWidth={3} />
          <rect x="4" y="9" width="9" height="2.5" {...s} />
          <rect x="11" y="12.5" width="9" height="2.5" {...s} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M1 12h3M20 12h3" {...s} strokeWidth={3} />
          <rect x="4" y={type === 'window' ? 10 : 9} width="16" height={type === 'window' ? 4 : 6} {...s} />
          <path d="M4 12h16" {...s} />
          {type === 'floorWindow' && <path d="M4 18h16" {...s} strokeDasharray="2 2" />}
        </svg>
      );
  }
}

export function Palette({ onPicked }: { onPicked?: () => void }) {
  const mode = useStore((s) => s.mode);
  if (mode === 'furniture') return <FurniturePalette onPicked={onPicked} />;
  return <PlanPalette onPicked={onPicked} />;
}

function PlanPalette({ onPicked }: { onPicked?: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="palette">
      <p className="palette-hint">
        <span className="hint-pc">クリックで追加（キャンバスへドラッグでも配置できます）。</span>
        <span className="hint-touch">タップで追加します。</span>
        部屋を選択中なら、その隣に追加されます。
      </p>
      {GROUPS.map((g) => (
        <section key={g.key} className="palette-section">
          <h3>{g.label}</h3>
          <div className="palette-grid">
            {ROOM_TYPE_DEFS.filter((d) => d.group === g.key).map((d) => (
              <button
                key={d.type}
                type="button"
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ROOM_DRAG_MIME, d.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => {
                  addRoomNearCenter(d.type);
                  onPicked?.();
                }}
                title={`${d.label}を追加`}
              >
                <span className="swatch" style={{ background: d.fill }} />
                <span>{d.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="palette-section">
        <h3>ドア・窓</h3>
        <div className="palette-grid">
          {OPENING_TYPE_DEFS.map((d) => {
            const active = tool.kind === 'placeOpening' && tool.type === d.type;
            return (
              <button
                key={d.type}
                type="button"
                className={`palette-item ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setTool(active ? { kind: 'select' } : { kind: 'placeOpening', type: d.type });
                  onPicked?.();
                }}
                title={`${d.label}を壁に配置`}
              >
                <span className="icon">
                  <OpeningIcon type={d.type} />
                </span>
                <span>{d.label}</span>
              </button>
            );
          })}
        </div>
      </section>
      <CustomPartPalette onPicked={onPicked} />
    </div>
  );
}
