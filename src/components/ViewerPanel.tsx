import { openingDef, roomDef } from '../model/catalog';
import { CUSTOM_SHAPE_LABEL } from '../model/customParts';
import { furnitureDef } from '../model/furnitureCatalog';
import type { PartInfo } from '../model/types';
import { useStore } from '../store/store';
import { hasPartInfo, PartInfoView } from './PartInfo';

/** 選ばれているパーツの名前・種類・参考情報 */
export function useSelectedPartInfo(): { name: string; kind: string; info?: PartInfo } | null {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  if (!sel) return null;
  switch (sel.kind) {
    case 'room': {
      const r = project.rooms.find((x) => x.id === sel.id);
      return r ? { name: r.name, kind: roomDef(r.type).label, info: r.info } : null;
    }
    case 'opening': {
      const o = project.openings.find((x) => x.id === sel.id);
      return o ? { name: openingDef(o.type).label, kind: 'ドア・窓', info: o.info } : null;
    }
    case 'furniture': {
      const f = project.furniture.find((x) => x.id === sel.id);
      return f ? { name: f.name, kind: furnitureDef(f.type).label, info: f.info } : null;
    }
    case 'custom': {
      const c = project.customParts.find((x) => x.id === sel.id);
      return c ? { name: c.name, kind: `カスタムパーツ（${CUSTOM_SHAPE_LABEL[c.shape]}）`, info: c.info } : null;
    }
  }
}

/** 共有リンクの閲覧中の設定欄: 選んだパーツの情報を表示するだけ（編集はできない） */
export function ViewerPanel() {
  const viewer = useStore((s) => s.viewer);
  const part = useSelectedPartInfo();
  if (!viewer) return null;
  return (
    <div className="props viewer-panel">
      <h2>{part ? part.name : viewer.name}</h2>
      {!part && (
        <>
          <p className="small">共有された間取りです（閲覧のみ）。部屋や家具をタップ・クリックすると、登録された画像・リンク・メモを見られます。</p>
          <p className="muted small">
            <span className="info-dot">i</span> の印があるパーツに情報が登録されています。家具は「家具配置」に切り替えると選べます。
          </p>
        </>
      )}
      {part && (
        <>
          <p className="muted small">{part.kind}</p>
          {hasPartInfo(part.info) ? <PartInfoView info={part.info} /> : <p className="muted small">このパーツには参考情報が登録されていません。</p>}
        </>
      )}
    </div>
  );
}
