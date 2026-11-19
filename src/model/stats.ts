import { isOutdoor } from './catalog';
import { checkFurniture } from './collision';
import { checkFlow } from './flowCheck';
import { sortedFloors } from './project';
import type { Project, Room, RoomType } from './types';
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

/** 床面積（バルコニーなど屋外は含めない。壁芯） */
export function floorArea(rooms: Room[]): number {
  return rooms.filter((r) => !isOutdoor(r.type)).reduce((s, r) => s + areaM2(r.w, r.h), 0);
}

export interface PlanStats {
  layout: string;
  roomCount: number;
  /** 延床面積（全階の合計） */
  totalArea: number;
  floors: { id: string; name: string; area: number }[];
  furnitureCount: number;
  warnings: number;
}

/** 案（materializePlan 済みのプロジェクト）の比較用統計。全階を対象にする */
export function planStats(p: Project): PlanStats {
  const floors = sortedFloors(p).map((f) => ({ id: f.id, name: f.name, area: floorArea(p.rooms.filter((r) => r.floorId === f.id)) }));
  let warnings = 0;
  for (const f of p.floors) {
    const view = { ...p, settings: { ...p.settings, activeFloorId: f.id } };
    warnings += checkFurniture(view).size + checkFlow(view).filter((i) => i.severity === 'warning').length;
  }
  return {
    layout: layoutLabel(p.rooms.map((r) => r.type)),
    roomCount: p.rooms.filter((r) => !isOutdoor(r.type)).length,
    totalArea: floors.reduce((s, f) => s + f.area, 0),
    floors,
    furnitureCount: p.furniture.length,
    warnings,
  };
}
