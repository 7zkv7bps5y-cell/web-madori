import { MAX_FLOORS, sortedFloors } from '../model/project';
import { useStore } from '../store/store';
import { useView } from '../store/view';

/** 階の切り替えタブ（キャンバス左上） */
export function FloorTabs() {
  const floors = useStore((s) => s.project.floors);
  const active = useStore((s) => s.project.settings.activeFloorId);
  const setActive = useStore((s) => s.setActiveFloor);
  const addFloor = useStore((s) => s.addFloor);
  const viewer = useStore((s) => !!s.viewer);
  return (
    <div className="floor-tabs" role="tablist" aria-label="階の切り替え">
      {sortedFloors({ floors }).map((f) => (
        <button key={f.id} type="button" role="tab" aria-selected={f.id === active} className={f.id === active ? 'active' : ''} onClick={() => setActive(f.id)}>
          {f.name}
        </button>
      ))}
      {!viewer && floors.length < MAX_FLOORS && (
        <button
          type="button"
          className="add"
          title="上の階を追加"
          aria-label="上の階を追加"
          onClick={() => {
            if (addFloor()) useView.getState().requestFit();
          }}
        >
          ＋階
        </button>
      )}
    </div>
  );
}
