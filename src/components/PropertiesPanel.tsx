import { useMemo, useState } from 'react';
import {
  FLOOR_PATTERN_LABELS,
  OPENING_TYPE_DEFS,
  ROOM_TYPE_DEFS,
  STYLE_COLORS,
  openingDef,
  roomDef,
} from '../model/catalog';
import { computeConnections, computeWalls, edgeLength } from '../model/geometry';
import { FLOOR_PATTERNS, type AreaUnit, type FloorPattern, type Opening, type Room, type Side } from '../model/types';
import { areaM2, formatArea, sizeFromTatami, tatamiFromSize } from '../model/units';
import { floorArea } from '../model/stats';
import { useView } from '../store/view';
import { activeRooms, useStore } from '../store/store';
import { NumberField, Segmented, TextField, toUnit, UNIT_FACTOR, type LengthUnit } from './fields';
import { FurnitureProps, FurnitureSummary } from './FurniturePanel';

const SIDE_LABEL: Record<Side, string> = { top: '上', right: '右', bottom: '下', left: '左' };

export function RoomTypeSelect({ value, onChange }: { value: Room['type']; onChange: (t: Room['type']) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Room['type'])} aria-label="部屋の種類">
      <optgroup label="部屋">
        {ROOM_TYPE_DEFS.filter((d) => d.group === 'main').map((d) => (
          <option key={d.type} value={d.type}>
            {d.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="水回り">
        {ROOM_TYPE_DEFS.filter((d) => d.group === 'water').map((d) => (
          <option key={d.type} value={d.type}>
            {d.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="その他">
        {ROOM_TYPE_DEFS.filter((d) => d.group === 'other').map((d) => (
          <option key={d.type} value={d.type}>
            {d.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function RoomProps({ room }: { room: Room }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const [unit, setUnit] = useState<LengthUnit>('cm');
  const { settings } = project;
  const rooms = activeRooms(project);
  const neighbors = useMemo(() => {
    const conns = computeConnections(computeWalls(rooms, settings.activeFloorId));
    return conns
      .filter((c) => c.a === room.id || c.b === room.id)
      .map((c) => rooms.find((r) => r.id === (c.a === room.id ? c.b : c.a)))
      .filter((r): r is Room => !!r);
  }, [rooms, room.id, settings.activeFloorId]);

  const resize = (w: number, h: number) => {
    const ok = st.setRoomRect(room.id, { x: room.x, y: room.y, w, h });
    if (!ok) st.notify('他の部屋と重なるため、そのサイズにはできません。', 'error');
  };
  const f = UNIT_FACTOR[unit];
  const area = areaM2(room.w, room.h);

  return (
    <div className="props">
      <h2>部屋の設定</h2>
      <TextField label="部屋名" value={room.name} onCommit={(v) => st.updateRoom(room.id, { name: v })} />
      <label className="field">
        <span className="field-label">種類</span>
        <RoomTypeSelect value={room.type} onChange={(t) => st.setRoomType(room.id, t)} />
      </label>

      <div className="props-group">
        <div className="props-row-head">
          <h3>寸法</h3>
          <Segmented
            ariaLabel="寸法の単位"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'm', label: 'm' },
              { value: 'mm', label: 'mm' },
            ]}
          />
        </div>
        <div className="props-row">
          <NumberField label="横幅" value={toUnit(room.w, unit)} suffix={unit} min={0.01} onCommit={(v) => resize(Math.max(100, v * f), room.h)} />
          <NumberField label="縦幅" value={toUnit(room.h, unit)} suffix={unit} min={0.01} onCommit={(v) => resize(room.w, Math.max(100, v * f))} />
        </div>
        <div className="props-row">
          <NumberField
            label="広さ（畳）"
            value={String(Math.round(tatamiFromSize(room.w, room.h, settings.tatamiArea) * 10) / 10)}
            suffix="畳"
            min={0.5}
            onCommit={(v) => {
              const s = sizeFromTatami(v, settings.gridSize, settings.tatamiArea, room.w > room.h);
              resize(s.w, s.h);
            }}
          />
          <div className="field readonly">
            <span className="field-label">面積</span>
            <span>
              {formatArea(area, 'm2')} / {formatArea(area, 'tsubo')}
            </span>
          </div>
        </div>
      </div>

      <div className="props-group">
        <h3>隣に部屋を追加</h3>
        <div className="dir-buttons">
          {(['top', 'left', 'right', 'bottom'] as Side[]).map((d) => (
            <button key={d} type="button" className={`dir-${d}`} onClick={() => st.openAddDialog({ baseId: room.id, dir: d })}>
              ＋{SIDE_LABEL[d]}
            </button>
          ))}
        </div>
        {neighbors.length > 0 && (
          <p className="muted small">接している部屋: {neighbors.map((n) => n.name).join('、')}</p>
        )}
      </div>

      <div className="props-group">
        <h3>表示スタイル</h3>
        <div className="swatches" role="radiogroup" aria-label="部屋の色">
          <button
            type="button"
            className={`swatch-btn ${room.style.fill === null ? 'active' : ''}`}
            style={{ background: roomDef(room.type).fill }}
            onClick={() => st.updateRoom(room.id, { style: { ...room.style, fill: null } })}
            title="標準色"
            aria-label="標準色"
          >
            標準
          </button>
          {STYLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch-btn ${room.style.fill === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => st.updateRoom(room.id, { style: { ...room.style, fill: c } })}
              aria-label={`色 ${c}`}
            />
          ))}
          <input
            type="color"
            aria-label="色を選ぶ"
            value={room.style.fill ?? roomDef(room.type).fill}
            onChange={(e) => st.updateRoom(room.id, { style: { ...room.style, fill: e.target.value } })}
          />
        </div>
        <label className="field">
          <span className="field-label">床の模様</span>
          <select
            value={room.style.floor}
            onChange={(e) => st.updateRoom(room.id, { style: { ...room.style, floor: e.target.value as FloorPattern } })}
          >
            {FLOOR_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {FLOOR_PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <div className="checks">
          {(
            [
              ['showFixtures', '設備を表示'],
              ['showLabel', '部屋名を表示'],
              ['showArea', '広さを表示'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check">
              <input
                type="checkbox"
                checked={room.style[key]}
                onChange={(e) => st.updateRoom(room.id, { style: { ...room.style, [key]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={() => st.rotateRoom(room.id)} title="90°回転 (R)">
          ↻ 回転
        </button>
        <button type="button" onClick={() => st.duplicateRoom(room.id)} title="複製 (Ctrl+D)">
          ⧉ 複製
        </button>
        <button type="button" className="danger" onClick={() => st.deleteRoom(room.id)} title="削除 (Delete)">
          🗑 削除
        </button>
      </div>
    </div>
  );
}

function OpeningProps({ opening }: { opening: Opening }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const room = project.rooms.find((r) => r.id === opening.roomId);
  const def = openingDef(opening.type);
  const maxLen = room ? edgeLength(room, opening.side) : opening.width;
  return (
    <div className="props">
      <h2>{def.label}の設定</h2>
      <label className="field">
        <span className="field-label">種類</span>
        <select
          value={opening.type}
          onChange={(e) => {
            const type = e.target.value as Opening['type'];
            const nd = openingDef(type);
            st.updateOpening(opening.id, {
              type,
              width: Math.min(maxLen, nd.width),
              swing: nd.kind === 'window' ? 'out' : opening.swing,
            });
          }}
        >
          {OPENING_TYPE_DEFS.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        取り付け先: {room?.name ?? '-'} の{SIDE_LABEL[opening.side]}側の壁（ドラッグで別の壁へ移動できます）
      </p>
      <div className="props-row">
        <NumberField
          label="幅"
          value={toUnit(opening.width, 'cm')}
          suffix="cm"
          min={1}
          onCommit={(v) => st.updateOpening(opening.id, { width: Math.max(def.minWidth, Math.min(maxLen, v * 10)) })}
        />
        <NumberField
          label="壁の端から"
          value={toUnit(opening.offset, 'cm')}
          suffix="cm"
          min={0}
          onCommit={(v) => st.updateOpening(opening.id, { offset: v * 10 })}
        />
      </div>
      {def.kind === 'door' && (
        <div className="actions">
          <button type="button" onClick={() => st.updateOpening(opening.id, { hinge: opening.hinge === 'start' ? 'end' : 'start' })}>
            ⇆ 吊元を反転
          </button>
          <button type="button" onClick={() => st.updateOpening(opening.id, { swing: opening.swing === 'in' ? 'out' : 'in' })}>
            ⇅ 開く向きを反転
          </button>
        </div>
      )}
      {def.kind === 'sliding' && (
        <div className="actions">
          <button type="button" onClick={() => st.updateOpening(opening.id, { swing: opening.swing === 'in' ? 'out' : 'in' })}>
            ⇅ 戸の向きを反転
          </button>
        </div>
      )}
      <div className="actions">
        <button type="button" onClick={() => st.duplicateSelection()}>
          ⧉ 複製
        </button>
        <button type="button" className="danger" onClick={() => st.deleteOpening(opening.id)}>
          🗑 削除
        </button>
      </div>
    </div>
  );
}

function ProjectProps() {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const rooms = activeRooms(project);
  const total = floorArea(rooms);
  const grand = floorArea(project.rooms);
  const { settings } = project;
  const floor = project.floors.find((f) => f.id === settings.activeFloorId);
  const multi = project.floors.length > 1;
  const showBelow = useView((s) => s.showBelow);
  return (
    <div className="props">
      <h2>間取り全体</h2>
      <div className="stats">
        <div>
          <span className="muted small">部屋数</span>
          <strong>{rooms.length}</strong>
        </div>
        <div>
          <span className="muted small">{multi ? `${floor?.name ?? ''}の床面積` : '床面積（部屋の合計）'}</span>
          <strong>
            {formatArea(total, 'm2')}（{formatArea(total, 'tsubo')}）
          </strong>
        </div>
        {multi && (
          <div>
            <span className="muted small">延床面積（全階の合計）</span>
            <strong>
              {formatArea(grand, 'm2')}（{formatArea(grand, 'tsubo')}）
            </strong>
          </div>
        )}
      </div>
      <p className="muted small">床面積は壁芯の目安で、バルコニーは含みません。</p>
      {floor && (
        <div className="props-group">
          <h3>階の設定</h3>
          <TextField label="階の名前" value={floor.name} maxLength={20} onCommit={(v) => st.renameFloor(floor.id, v)} />
          {multi && (
            <label className="check">
              <input type="checkbox" checked={showBelow} onChange={(e) => useView.getState().set({ showBelow: e.target.checked })} />
              下の階を薄く表示する
            </label>
          )}
          <div className="actions">
            <button type="button" onClick={() => st.addFloor() && useView.getState().requestFit()}>
              ＋ 上の階を追加
            </button>
            {multi && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (window.confirm(`${floor.name}を削除しますか？ この階の部屋・ドア・家具も削除されます（元に戻すで戻せます）。`)) st.deleteFloor(floor.id);
                }}
              >
                🗑 この階を削除
              </button>
            )}
          </div>
        </div>
      )}
      <div className="field">
        <span className="field-label">広さの表示単位</span>
        <Segmented<AreaUnit>
          ariaLabel="広さの表示単位"
          value={settings.areaUnit}
          onChange={(v) => st.setSettings({ areaUnit: v })}
          options={[
            { value: 'tatami', label: '帖' },
            { value: 'm2', label: '㎡' },
            { value: 'tsubo', label: '坪' },
          ]}
        />
      </div>
      <label className="field">
        <span className="field-label">スナップ間隔（グリッド）</span>
        <select value={settings.gridSize} onChange={(e) => st.setSettings({ gridSize: Number(e.target.value) })}>
          <option value={910}>910mm（1マス）</option>
          <option value={455}>455mm（半マス）</option>
          <option value={227.5}>227.5mm（1/4マス）</option>
          <option value={50}>50mm（細かく）</option>
        </select>
      </label>
      <div className="guide">
        <h3>かんたん操作ガイド</h3>
        <ol>
          <li>左の「部屋」から部屋を追加します。</li>
          <li>部屋を選ぶと上下左右に <b>＋</b> が出るので、押すとその方向に部屋が増えます。</li>
          <li>部屋はドラッグで移動、四隅・辺の□でサイズ変更できます。</li>
          <li>「ドア・窓」を選んで壁をクリックすると取り付けられます。</li>
          <li>Ctrl+Z で元に戻す、Delete で削除できます。</li>
        </ol>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  if (mode === 'furniture') {
    const f = selection?.kind === 'furniture' ? project.furniture.find((x) => x.id === selection.id) : undefined;
    return f ? <FurnitureProps key={f.id} item={f} /> : <FurnitureSummary />;
  }
  if (selection?.kind === 'room') {
    const room = project.rooms.find((r) => r.id === selection.id);
    if (room) return <RoomProps key={room.id} room={room} />;
  }
  if (selection?.kind === 'opening') {
    const o = project.openings.find((x) => x.id === selection.id);
    if (o) return <OpeningProps key={o.id} opening={o} />;
  }
  return <ProjectProps />;
}
