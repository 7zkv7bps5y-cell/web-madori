import { useEffect, useState } from 'react';
import {
  CUSTOM_SHAPE_LABEL,
  defaultDesign,
  defaultSize,
  loadLibrary,
  outlinePath,
  removeFromLibrary,
  type LibraryPart,
} from '../model/customParts';
import type { CustomShape } from '../model/types';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import { addCustomPartNearCenter } from './Canvas';

/** ライブラリの変更を画面に反映するための通知 */
export const LIBRARY_EVENT = 'web-madori:library-changed';
export function notifyLibraryChanged() {
  window.dispatchEvent(new Event(LIBRARY_EVENT));
}

function ShapeIcon({ shape, points }: { shape: CustomShape; points?: [number, number][] }) {
  const d = outlinePath({ shape, w: 18, h: shape === 'rect' ? 12 : shape === 'ellipse' ? 13 : 18, points });
  return (
    <svg viewBox="-12 -12 24 24" width={20} height={20} aria-hidden>
      <path d={d} fill="#d9e8d2" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/** カスタムパーツ（図形を作る・マイパーツから置く） */
export function CustomPartPalette({ onPicked }: { onPicked?: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const [lib, setLib] = useState<LibraryPart[]>(() => loadLibrary());
  useEffect(() => {
    const on = () => setLib(loadLibrary());
    window.addEventListener(LIBRARY_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(LIBRARY_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);

  const place = (shape: CustomShape) => {
    addCustomPartNearCenter(defaultDesign(shape), defaultSize(shape));
    onPicked?.();
  };
  const draw = (shape: 'polygon' | 'freehand') => {
    const active = tool.kind === 'drawShape' && tool.shape === shape;
    useView.getState().set({ draft: [] });
    setTool(active ? { kind: 'select' } : { kind: 'drawShape', shape });
    onPicked?.();
  };

  return (
    <section className="palette-section">
      <h3>カスタムパーツ（自由な図形）</h3>
      <div className="palette-grid">
        {(['rect', 'circle', 'ellipse'] as const).map((s) => (
          <button key={s} type="button" className="palette-item" onClick={() => place(s)} title={`${CUSTOM_SHAPE_LABEL[s]}を置く`}>
            <span className="icon">
              <ShapeIcon shape={s} />
            </span>
            <span>{CUSTOM_SHAPE_LABEL[s]}</span>
          </button>
        ))}
        {(['polygon', 'freehand'] as const).map((s) => {
          const active = tool.kind === 'drawShape' && tool.shape === s;
          return (
            <button
              key={s}
              type="button"
              className={`palette-item ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => draw(s)}
              title={s === 'polygon' ? '頂点をタップして多角形を描く' : '指やマウスでなぞって形を描く'}
            >
              <span className="icon">
                <ShapeIcon shape="polygon" points={s === 'polygon' ? [[-0.5, 0.4], [0, -0.5], [0.5, 0.4]] : [[-0.5, 0.2], [-0.2, -0.5], [0.3, -0.3], [0.5, 0.3], [0, 0.5]]} />
              </span>
              <span>{CUSTOM_SHAPE_LABEL[s]}</span>
            </button>
          );
        })}
      </div>
      <h3>マイパーツ（保存したパーツ）</h3>
      {lib.length === 0 ? (
        <p className="palette-hint">作ったパーツを選んで「マイパーツに保存」すると、ここから別の間取りでも使えます。</p>
      ) : (
        <ul className="library-list">
          {lib.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="palette-item"
                onClick={() => {
                  addCustomPartNearCenter(l.design, { w: l.w, h: l.h }, l.id);
                  onPicked?.();
                }}
                title={`${l.design.name}を置く（${Math.round(l.w / 10)}×${Math.round(l.h / 10)}cm）`}
              >
                <span className="icon">
                  <ShapeIcon shape={l.design.shape} points={l.design.points} />
                </span>
                <span className="palette-label">
                  {l.design.name}
                  <small>
                    {Math.round(l.w / 10)}×{Math.round(l.h / 10)}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="library-remove"
                aria-label={`${l.design.name}をマイパーツから削除`}
                title="マイパーツから削除（置いたパーツは消えません）"
                onClick={() => {
                  if (!window.confirm(`「${l.design.name}」をマイパーツから削除しますか？（間取りに置いたパーツは消えません）`)) return;
                  removeFromLibrary(l.id);
                  notifyLibraryChanged();
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
