import { useMemo } from 'react';
import { checkFurniture, type FurnitureIssue } from '../model/collision';
import { checkFlow, FIX_LABEL, type FlowIssue } from '../model/flowCheck';
import { FURNITURE_CATEGORIES, FURNITURE_DEFS, furnitureDef } from '../model/furnitureCatalog';
import type { Furniture, Project } from '../model/types';
import { normalizeAngle, useStore } from '../store/store';
import { useView } from '../store/view';
import { NumberField, TextField, toUnit } from './fields';
import { PartInfoSection } from './PartInfo';
import { ProductSuggestions } from './ProductSuggestions';

export function issueText(issue: FurnitureIssue, p: Project): string {
  switch (issue.kind) {
    case 'overlap':
      return `「${p.furniture.find((f) => f.id === issue.otherId)?.name ?? '家具'}」と重なっています`;
    case 'wall':
      return '壁と干渉しています';
    case 'outside':
      return '部屋の外に置かれています';
    case 'stairs':
      return '階段と重なっています';
  }
}

function useFlow() {
  const project = useStore((s) => s.project);
  return useMemo(() => checkFlow(project), [project]);
}

/** 生活動線チェックの結果一覧（改善の提案と、ワンクリックで直せるものはボタン） */
function FlowIssueList({ issues, selectable }: { issues: FlowIssue[]; selectable: boolean }) {
  const st = useStore.getState();
  return (
    <ul className="flow-list">
      {issues.map((i) => (
        <li key={i.id} className={i.severity}>
          <span className="flow-tag">{i.severity === 'warning' ? '要確認' : '目安'}</span>
          {selectable ? (
            <button type="button" className="link" onClick={() => st.select({ kind: 'furniture', id: i.furnitureIds[0] })}>
              {i.message}
            </button>
          ) : (
            <span>{i.message}</span>
          )}
          <p className="muted small">{i.suggestion}</p>
          {i.fixes.length > 0 && (
            <div className="btn-group wrap">
              {i.fixes.map((f) => (
                <button key={f.kind} type="button" className="primary small-btn" onClick={() => st.applyFlowFix(f)}>
                  {FIX_LABEL[f.kind]}
                </button>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function useIssues() {
  const project = useStore((s) => s.project);
  return useMemo(() => checkFurniture(project), [project]);
}

function roomAt(p: Project, f: Furniture) {
  return p.rooms.find(
    (r) => r.floorId === f.floorId && f.x > r.x && f.x < r.x + r.w && f.y > r.y && f.y < r.y + r.h,
  );
}

export function FurnitureProps({ item }: { item: Furniture }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const issues = useIssues().get(item.id) ?? [];
  const flow = useFlow().filter((i) => i.furnitureIds.includes(item.id));
  const def = furnitureDef(item.type);
  const room = roomAt(project, item);
  const set = (patch: Partial<Furniture>) => st.updateFurniture(item.id, patch);
  return (
    <div className="props">
      <h2>{item.name}の設定</h2>
      <TextField label="名前" value={item.name} onCommit={(v) => set({ name: v.trim() || def.label })} />
      <label className="field">
        <span className="field-label">種類</span>
        <select
          value={item.type}
          onChange={(e) => {
            const nd = furnitureDef(e.target.value);
            const wasDefaultName = item.name === def.label;
            set({ type: nd.type, w: nd.w, d: nd.d, height: nd.height, name: wasDefaultName ? nd.label : item.name });
          }}
        >
          {FURNITURE_CATEGORIES.map((c) => (
            <optgroup key={c.key} label={c.label}>
              {FURNITURE_DEFS.filter((d) => d.category === c.key).map((d) => (
                <option key={d.type} value={d.type}>
                  {d.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="muted small">置いている部屋: {room?.name ?? 'なし'}</p>

      <div className="props-group">
        <h3>サイズ（実際の家具の寸法を入力できます）</h3>
        <div className="props-row">
          <NumberField label="幅" value={toUnit(item.w, 'cm')} suffix="cm" min={1} onCommit={(v) => set({ w: Math.max(100, v * 10) })} />
          <NumberField label="奥行き" value={toUnit(item.d, 'cm')} suffix="cm" min={1} onCommit={(v) => set({ d: Math.max(100, v * 10) })} />
        </div>
        <div className="props-row">
          <NumberField label="高さ" value={toUnit(item.height, 'cm')} suffix="cm" min={1} onCommit={(v) => set({ height: Math.max(10, v * 10) })} />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <button type="button" onClick={() => set({ w: def.w, d: def.d, height: def.height })}>
              標準サイズに戻す
            </button>
          </div>
        </div>
      </div>

      <div className="props-group">
        <h3>向き</h3>
        <div className="props-row">
          <NumberField label="回転" value={String(item.rotation)} suffix="°" onCommit={(v) => set({ rotation: normalizeAngle(v) })} />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <div className="btn-group">
              <button type="button" onClick={() => st.rotateFurniture(item.id, -90)} aria-label="左に90度回転">
                ↺90°
              </button>
              <button type="button" onClick={() => st.rotateFurniture(item.id, 90)} aria-label="右に90度回転">
                ↻90°
              </button>
            </div>
          </div>
        </div>
        <p className="muted small">上側（背面）を壁に付けるのが基本の向きです。回転ハンドルは 15° 単位（Shift で 1° 単位）。</p>
      </div>

      {issues.length > 0 && (
        <div className="props-group">
          <h3>確認が必要な点</h3>
          <ul className="warn-list">
            {issues.map((i, k) => (
              <li key={k}>{issueText(i, project)}</li>
            ))}
          </ul>
          <p className="muted small">重なっていても配置はできます。実際に置けるか確認してください。</p>
        </div>
      )}

      {flow.length > 0 && (
        <div className="props-group">
          <h3>生活動線チェック</h3>
          <FlowIssueList issues={flow} selectable={false} />
        </div>
      )}

      <PartInfoSection info={item.info} project={project} onChange={(i) => st.setPartInfo({ kind: 'furniture', id: item.id }, i)} />
      <ProductSuggestions item={item} />

      <div className="actions">
        <button type="button" onClick={() => st.duplicateFurniture(item.id)}>
          ⧉ 複製
        </button>
        <button type="button" className="danger" onClick={() => st.deleteFurniture(item.id)}>
          🗑 削除
        </button>
      </div>
    </div>
  );
}

export function FurnitureSummary() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const setSettings = useStore((s) => s.setSettings);
  const showDims = useView((s) => s.showDims);
  const setView = useView((s) => s.set);
  const issues = useIssues();
  const flow = useFlow();
  const showFlow = useView((s) => s.showFlow);
  const flowWarnings = flow.filter((i) => i.severity === 'warning');
  const flowInfo = flow.filter((i) => i.severity === 'info');
  const items = project.furniture.filter((f) => f.floorId === project.settings.activeFloorId);
  return (
    <div className="props">
      <h2>家具配置</h2>
      <div className="stats">
        <div>
          <span className="muted small">配置した家具・家電</span>
          <strong>{items.length} 点</strong>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={showDims} onChange={(e) => setView({ showDims: e.target.checked })} />
        すべての家具の寸法を表示
      </label>
      <label className="field">
        <span className="field-label">移動のスナップ間隔</span>
        <select value={project.settings.furnitureGrid} onChange={(e) => setSettings({ furnitureGrid: Number(e.target.value) })}>
          <option value={10}>1cm</option>
          <option value={50}>5cm</option>
          <option value={100}>10cm</option>
        </select>
      </label>
      <p className="muted small">グリッドの 1 マス = 45.5cm（太線 91cm）。壁の近くでは自動的に壁へぴったり寄ります。</p>
      <div className="props-group">
        <h3>干渉チェック</h3>
        {issues.size === 0 ? (
          <p className="muted small">{items.length ? '重なりや壁との干渉はありません。' : '家具を追加するとここで確認できます。'}</p>
        ) : (
          <ul className="warn-list">
            {Array.from(issues.entries()).map(([id, list]) => {
              const f = project.furniture.find((x) => x.id === id);
              return (
                <li key={id}>
                  <button type="button" onClick={() => select({ kind: 'furniture', id })}>
                    {f?.name}
                  </button>
                  ：{list.map((i) => issueText(i, project)).join('、')}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="props-group">
        <h3>生活動線チェック</h3>
        <label className="check">
          <input type="checkbox" checked={showFlow} onChange={(e) => setView({ showFlow: e.target.checked })} />
          ドアの開閉範囲・家具の前の空き・すき間を図に表示
        </label>
        {flow.length === 0 ? (
          <p className="muted small">
            {items.length ? 'ドアの開閉や家具の使い勝手で気になる点はありません。' : '家具を置くと、ドアの開閉範囲や通路幅を確認できます。'}
          </p>
        ) : (
          <>
            <p className="small">
              要確認 <b>{flowWarnings.length}</b> 件 ／ 目安 <b>{flowInfo.length}</b> 件
            </p>
            <FlowIssueList issues={[...flowWarnings, ...flowInfo]} selectable />
          </>
        )}
        <p className="muted small">
          通路幅は {60}cm 以上が目安です。判定は目安なので、実際の暮らし方に合わせて確認してください。
        </p>
      </div>
      <div className="guide">
        <h3>家具配置の操作</h3>
        <ol>
          <li>左の一覧から家具を選ぶと画面中央に置かれます。</li>
          <li>ドラッグで移動、○ハンドルでサイズ変更、↻で回転します。</li>
          <li>重なりや壁との干渉は赤い点線で表示されます。</li>
          <li>矢印キーで 1cm（Shift で 10cm）ずつ動かせます。</li>
        </ol>
      </div>
    </div>
  );
}
