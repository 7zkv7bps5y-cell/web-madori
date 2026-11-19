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
  /** 間取りタイプ（例: 2LDK） */
  name: string;
  description: string;
  create: () => Project;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: '1k',
    name: '1K',
    description: '一人暮らし向け。洋室とキッチン・水回りがまとまったコンパクトな間取り',
    create: () =>
      build(
        '1K サンプル',
        [
          ['room', 'room', 0, 0, 3640, 3640],
          ['kitchen', 'kitchen', 0, 3640, 2275, 2730, 270],
          ['bath', 'bath', 2275, 3640, 1365, 1820, 90],
          ['toilet', 'toilet', 2275, 5460, 1365, 910, 90],
          ['entrance', 'entrance', 0, 6370, 1820, 1365],
        ],
        [
          ['entrance', 'entranceDoor', 'bottom', 455, 910, 'out'],
          ['entrance', 'door', 'top', 520, 780],
          ['kitchen', 'door', 'top', 1100, 780, 'out'],
          ['bath', 'door', 'left', 520, 780, 'out'],
          ['toilet', 'door', 'left', 65, 780, 'out'],
          ['room', 'floorWindow', 'top', 995, 1650],
          ['room', 'window', 'right', 1365, 910],
          ['bath', 'window', 'right', 455, 910],
        ],
        [
          ['bed-single', 2590, 2600, 90],
          ['desk', 375, 1500, 270],
          ['fridge', 975, 5970, 180],
        ],
      ),
  },
  {
    id: '1ldk',
    name: '1LDK',
    description: '二人暮らしにも。LDKの隣に寝室、水回りは廊下からアクセス',
    create: () =>
      build(
        '1LDK サンプル',
        [
          ['ldk', 'ldk', 0, 0, 5460, 3640],
          ['bedroom', 'bedroom', 5460, 0, 3640, 3640],
          ['entrance', 'entrance', 0, 3640, 1820, 1820],
          ['hall', 'hall', 1820, 3640, 910, 1820],
          ['dressing', 'dressing', 2730, 3640, 1820, 1820],
          ['bath', 'bath', 4550, 3640, 1820, 1820, 90],
          ['toilet', 'toilet', 1820, 5460, 910, 1365, 180],
          ['closet', 'closet', 6370, 3640, 1820, 1820],
        ],
        [
          ['entrance', 'entranceDoor', 'left', 455, 910, 'out'],
          ['entrance', 'door', 'right', 520, 780, 'out'],
          ['hall', 'door', 'top', 65, 780, 'out'],
          ['hall', 'door', 'bottom', 65, 780, 'out'],
          ['dressing', 'door', 'left', 520, 780],
          ['bath', 'door', 'left', 520, 780, 'out'],
          ['bedroom', 'door', 'left', 2600, 780],
          ['closet', 'slidingDoor', 'top', 180, 1460, 'in'],
          ['ldk', 'floorWindow', 'top', 455, 1650],
          ['ldk', 'window', 'left', 1365, 910],
          ['bedroom', 'largeWindow', 'top', 995, 1650],
          ['bedroom', 'window', 'right', 1365, 910],
        ],
        [
          ['sofa', 500, 2200, 270],
          ['table', 1300, 2200, 90],
          ['dining-table', 3900, 2200],
          ['fridge', 2585, 425],
          ['bed-double', 7280, 1050],
        ],
      ),
  },
  {
    id: '2ldk-flat',
    name: '2LDK（平屋）',
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
  {
    id: '4ldk',
    name: '4LDK',
    description: 'ファミリー向け。広めのLDKに和室がつながり、洋室3つと水回りを廊下でつなぐ',
    create: () =>
      build(
        '4LDK サンプル',
        [
          ['ldk', 'ldk', 0, 0, 5460, 4550],
          ['washitsu', 'washitsu', 5460, 0, 2730, 3640],
          ['bedroom', 'bedroom', 5460, 3640, 2730, 3640],
          ['hall', 'hall', 2730, 4550, 910, 3640],
          ['kidsA', 'kids', 0, 4550, 2730, 2730],
          ['kidsB', 'room', 0, 7280, 2730, 2730],
          ['dressing', 'dressing', 3640, 4550, 1820, 1820],
          ['bath', 'bath', 3640, 6370, 1820, 1820, 180],
          ['entrance', 'entrance', 2730, 8190, 1820, 1820],
          ['toilet', 'toilet', 4550, 8190, 910, 1820, 90],
        ],
        [
          ['entrance', 'entranceDoor', 'bottom', 455, 910, 'out'],
          ['hall', 'door', 'top', 65, 780, 'out'],
          ['washitsu', 'slidingDoor', 'left', 1800, 1460],
          ['bedroom', 'door', 'left', 100, 780],
          ['kidsA', 'door', 'right', 1100, 780],
          ['kidsB', 'door', 'right', 100, 780],
          ['dressing', 'door', 'left', 520, 780],
          ['bath', 'door', 'top', 520, 780, 'out'],
          ['toilet', 'door', 'left', 520, 780, 'out'],
          ['ldk', 'floorWindow', 'top', 455, 1650],
          ['ldk', 'window', 'left', 1820, 910],
          ['washitsu', 'largeWindow', 'top', 540, 1650],
          ['bedroom', 'window', 'right', 1365, 910],
          ['kidsA', 'window', 'left', 910, 910],
          ['kidsB', 'window', 'left', 910, 910],
        ],
        [
          ['sofa', 500, 2600, 270],
          ['table', 1300, 2600, 90],
          ['dining-table', 3900, 2500],
          ['fridge', 2585, 425],
          ['bed-double', 7100, 4665],
          ['bed-single', 1050, 5300, 270],
          ['desk', 1980, 8800, 90],
        ],
      ),
  },
];
