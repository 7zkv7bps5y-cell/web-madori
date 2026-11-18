import type { FloorPattern, OpeningType, RoomType } from './types';

export interface RoomTypeDef {
  type: RoomType;
  label: string;
  /** パレットでのグループ */
  group: 'main' | 'water' | 'other';
  fill: string;
  floor: Exclude<FloorPattern, 'auto'>;
  /** 標準サイズ (mm) */
  w: number;
  h: number;
}

export const ROOM_TYPE_DEFS: RoomTypeDef[] = [
  { type: 'room', label: '洋室', group: 'main', fill: '#f7f3ea', floor: 'none', w: 2730, h: 3640 },
  { type: 'living', label: 'リビング', group: 'main', fill: '#fbf1dc', floor: 'flooring', w: 3640, h: 3640 },
  { type: 'dining', label: 'ダイニング', group: 'main', fill: '#fbf1dc', floor: 'flooring', w: 2730, h: 2730 },
  { type: 'kitchen', label: 'キッチン', group: 'water', fill: '#f4ece0', floor: 'none', w: 2730, h: 1820 },
  { type: 'ldk', label: 'LDK', group: 'main', fill: '#fbf1dc', floor: 'flooring', w: 5460, h: 3640 },
  { type: 'ld', label: 'LD', group: 'main', fill: '#fbf1dc', floor: 'flooring', w: 4550, h: 3640 },
  { type: 'dk', label: 'DK', group: 'main', fill: '#fbf1dc', floor: 'flooring', w: 3640, h: 2730 },
  { type: 'bedroom', label: '寝室', group: 'main', fill: '#eef0f7', floor: 'none', w: 3640, h: 3640 },
  { type: 'kids', label: '子供部屋', group: 'main', fill: '#f3f7ec', floor: 'none', w: 2730, h: 3640 },
  { type: 'washitsu', label: '和室', group: 'main', fill: '#eef2d8', floor: 'tatami', w: 2730, h: 3640 },
  { type: 'study', label: '書斎', group: 'main', fill: '#f2ede6', floor: 'none', w: 1820, h: 2730 },
  { type: 'dressing', label: '脱衣所', group: 'water', fill: '#e8f3f6', floor: 'none', w: 1820, h: 1820 },
  { type: 'washroom', label: '洗面所', group: 'water', fill: '#e8f3f6', floor: 'none', w: 1820, h: 1365 },
  { type: 'bath', label: '浴室', group: 'water', fill: '#dff0f5', floor: 'tile', w: 1820, h: 1820 },
  { type: 'toilet', label: 'トイレ', group: 'water', fill: '#e8f3f6', floor: 'none', w: 910, h: 1820 },
  { type: 'storage', label: '収納', group: 'other', fill: '#efebe4', floor: 'none', w: 910, h: 910 },
  { type: 'closet', label: 'クローゼット', group: 'other', fill: '#efebe4', floor: 'none', w: 910, h: 1820 },
  { type: 'hall', label: '廊下', group: 'other', fill: '#f5f1e8', floor: 'flooring', w: 910, h: 2730 },
  { type: 'entrance', label: '玄関', group: 'other', fill: '#e9e6e1', floor: 'tile', w: 1820, h: 1820 },
  { type: 'stairs', label: '階段', group: 'other', fill: '#f2eee6', floor: 'none', w: 910, h: 2730 },
];

const ROOM_MAP = new Map(ROOM_TYPE_DEFS.map((d) => [d.type, d]));
export function roomDef(type: RoomType): RoomTypeDef {
  return ROOM_MAP.get(type) ?? ROOM_TYPE_DEFS[0];
}

export interface OpeningTypeDef {
  type: OpeningType;
  label: string;
  kind: 'door' | 'sliding' | 'window';
  width: number;
  minWidth: number;
}

export const OPENING_TYPE_DEFS: OpeningTypeDef[] = [
  { type: 'entranceDoor', label: '玄関ドア', kind: 'door', width: 910, minWidth: 600 },
  { type: 'door', label: '室内ドア', kind: 'door', width: 780, minWidth: 500 },
  { type: 'slidingDoor', label: '引き戸', kind: 'sliding', width: 1460, minWidth: 600 },
  { type: 'window', label: '窓', kind: 'window', width: 910, minWidth: 300 },
  { type: 'largeWindow', label: '大きな窓', kind: 'window', width: 1650, minWidth: 600 },
  { type: 'floorWindow', label: '掃き出し窓', kind: 'window', width: 1650, minWidth: 600 },
];

const OPENING_MAP = new Map(OPENING_TYPE_DEFS.map((d) => [d.type, d]));
export function openingDef(type: OpeningType): OpeningTypeDef {
  return OPENING_MAP.get(type) ?? OPENING_TYPE_DEFS[0];
}

export const FLOOR_PATTERN_LABELS: Record<FloorPattern, string> = {
  auto: '種類に合わせる',
  none: 'なし',
  flooring: 'フローリング',
  tatami: '畳',
  tile: 'タイル',
};

export const STYLE_COLORS = [
  '#f7f3ea',
  '#fbf1dc',
  '#eef0f7',
  '#f3f7ec',
  '#eef2d8',
  '#e8f3f6',
  '#f9e7e7',
  '#efebe4',
  '#ffffff',
];
