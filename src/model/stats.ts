import { checkFurniture } from './collision';
import type { Project, RoomType } from './types';
import { areaM2 } from './units';

const HABITABLE: RoomType[] = ['room', 'bedroom', 'kids', 'washitsu', 'study'];

/** 「2LDK」のような間取りタイプ表記 */
export function layoutLabel(types: RoomType[]): string {
  const n = types.filter((t) => HABITABLE.includes(t)).length;
  const has = (t: RoomType) => types.includes(t);
  let suffix = '';
  if (has('ldk') || (has('living') && has('dining') && has('kitchen')) || (has('ld') && has('kitchen')) || (has('living') && has('dk')))
    suffix = 'LDK';
  else if (has('dk') || (has('dining') && has('kitchen'))) suffix = 'DK';
  else if (has('kitchen')) suffix = 'K';
  if (n === 0) return suffix ? `1${suffix === 'K' ? 'K' : suffix}` : '-';
  return `${n}${suffix}`;
}

export interface PlanStats {
  layout: string;
  roomCount: number;
  totalArea: number;
  furnitureCount: number;
  warnings: number;
}

/** 編集中の案（materializePlan 済みのプロジェクト）の比較用統計 */
export function planStats(p: Project): PlanStats {
  const floorId = p.settings.activeFloorId;
  const rooms = p.rooms.filter((r) => r.floorId === floorId);
  return {
    layout: layoutLabel(rooms.map((r) => r.type)),
    roomCount: rooms.length,
    totalArea: rooms.reduce((s, r) => s + areaM2(r.w, r.h), 0),
    furnitureCount: p.furniture.filter((f) => f.floorId === floorId).length,
    warnings: checkFurniture(p).size,
  };
}
