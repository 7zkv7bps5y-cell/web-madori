import { createFurniture, createOpening, createProject, createRoom } from './project';
import type { Opening, OpeningType, Project, Room, RoomType, Side } from './types';

type RoomSpec = [key: string, type: RoomType, x: number, y: number, w: number, h: number, rotation?: Room['rotation']];
type OpeningSpec = [roomKey: string, type: OpeningType, side: Side, offset: number, width: number, swing?: Opening['swing'], hinge?: Opening['hinge']];

type FurnitureSpec = [type: string, x: number, y: number, rotation?: number];

function build(name: string, roomSpecs: RoomSpec[], openingSpecs: OpeningSpec[], furnitureSpecs: FurnitureSpec[] = []): Project {
  const p = createProject(name);
  const floorId = p.settings.activeFloorId;
  const keys = new Map<string, Room>();
  for (const [key, type, x, y, w, h, rotation = 0] of roomSpecs) {
    const room = { ...createRoom(type, { x, y, w, h }, floorId), rotation };
    keys.set(key, room);
    p.rooms.push(room);
  }
  for (const [key, type, side, offset, width, swing, hinge] of openingSpecs) {
    const room = keys.get(key)!;
    const o = createOpening(type, { roomId: room.id, side, offset, width }, floorId);
    if (swing) o.swing = swing;
    if (hinge) o.hinge = hinge;
    p.openings.push(o);
  }
  for (const [type, x, y, rotation = 0] of furnitureSpecs) {
    p.furniture.push({ ...createFurniture(type, { x, y }, floorId), rotation });
  }
  return p;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  create: () => Project;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: '2ldk-flat',
    name: '平屋 2LDK',
    description: 'LDK・和室・寝室と水回りがそろった平屋の例',
    create: () =>
      build(
        '平屋 2LDK サンプル',
        [
          ['ldk', 'ldk', 0, 0, 5460, 3640, 180],
          ['washitsu', 'washitsu', 5460, 0, 2730, 3640],
          ['entrance', 'entrance', 0, 3640, 1820, 1820],
          ['hall', 'hall', 1820, 3640, 6370, 910],
          ['dressing', 'dressing', 1820, 4550, 1820, 1820, 270],
          ['bath', 'bath', 1820, 6370, 1820, 1820, 180],
          ['toilet', 'toilet', 3640, 4550, 910, 1820, 180],
          ['storage', 'closet', 3640, 6370, 910, 1820],
          ['bedroom', 'bedroom', 4550, 4550, 3640, 3640],
        ],
        [
          ['entrance', 'entranceDoor', 'left', 455, 910, 'out'],
          ['hall', 'door', 'left', 65, 780],
          ['ldk', 'door', 'bottom', 2730, 780],
          ['washitsu', 'slidingDoor', 'bottom', 400, 1460],
          ['dressing', 'door', 'top', 520, 780],
          ['dressing', 'slidingDoor', 'bottom', 300, 1200],
          ['toilet', 'door', 'top', 65, 780, 'out'],
          ['bedroom', 'door', 'top', 2600, 780],
          ['storage', 'slidingDoor', 'right', 180, 1460],
          ['ldk', 'floorWindow', 'top', 910, 1650],
          ['ldk', 'floorWindow', 'top', 3190, 1650],
          ['ldk', 'window', 'left', 1365, 910],
          ['washitsu', 'largeWindow', 'top', 540, 1650],
          ['bedroom', 'window', 'right', 1365, 910],
          ['bedroom', 'largeWindow', 'bottom', 990, 1650],
          ['bath', 'window', 'left', 455, 910],
        ],
        [
          ['sofa', 3900, 500],
          ['table', 3900, 1400],
          ['tv-stand', 4600, 3390, 180],
          ['dining-table', 1500, 1900],
          ['fridge', 425, 2665, 90],
          ['bed-double', 6370, 5575],
          ['aircon', 6370, 4725],
        ],
      ),
  },
];
