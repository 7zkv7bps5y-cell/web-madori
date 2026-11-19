/**
 * Web間取り プロジェクトデータ定義
 *
 * 座標系: 単位はすべてミリメートル(mm)。x は右方向、y は下方向が正。
 * 3D化を見据え、各フロアは level / height を持つ。
 */

export type Mm = number;

export interface Rect {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Rotation = 0 | 90 | 180 | 270;

export const ROOM_TYPES = [
  'room',
  'living',
  'dining',
  'kitchen',
  'ldk',
  'ld',
  'dk',
  'bedroom',
  'kids',
  'washitsu',
  'study',
  'dressing',
  'washroom',
  'bath',
  'toilet',
  'storage',
  'closet',
  'hall',
  'entrance',
  'stairs',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const FLOOR_PATTERNS = ['auto', 'none', 'flooring', 'tatami', 'tile'] as const;
export type FloorPattern = (typeof FLOOR_PATTERNS)[number];

/** 部屋の見た目。種類(type)とは独立して変更できる */
export interface RoomStyle {
  /** null の場合は種類ごとの標準色 */
  fill: string | null;
  /** auto の場合は種類ごとの標準パターン */
  floor: FloorPattern;
  /** 浴槽・便器などの設備表示 */
  showFixtures: boolean;
  showLabel: boolean;
  showArea: boolean;
}

export interface Room extends Rect {
  id: string;
  floorId: string;
  type: RoomType;
  name: string;
  /** 設備表示の向き（0 = 上側の壁が「奥」） */
  rotation: Rotation;
  /** 将来の L字などの多角形対応用。現状は 'rect' のみ */
  shape: 'rect';
  style: RoomStyle;
}

export const OPENING_TYPES = [
  'entranceDoor',
  'door',
  'slidingDoor',
  'window',
  'largeWindow',
  'floorWindow',
] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

/**
 * ドア・窓などの開口部。
 * 部屋の辺(side)に紐づけ、辺の始点(上/下辺は左端、左/右辺は上端)からの距離 offset で位置を表す。
 * 共有壁上の開口部は 1 つだけ保持し、描画も 1 回だけ行う。
 */
export interface Opening {
  id: string;
  floorId: string;
  type: OpeningType;
  roomId: string;
  side: Side;
  offset: Mm;
  width: Mm;
  /** ドアの吊元（辺の始点側 or 終点側） */
  hinge: 'start' | 'end';
  /** ドアの開く向き（in = 紐づく部屋の内側） */
  swing: 'in' | 'out';
}

/**
 * 家具・家電・設備。部屋とは独立したオブジェクトで、ワールド座標(mm)で保持する。
 * ローカル座標系: 幅(w)方向 = x、奥行き(d)方向 = y。奥(-y 側)が背面（壁に付ける側）、手前(+y 側)が正面。
 * この「正面」の約束は将来の生活動線チェック（扉・引き出しの可動範囲）で使う。
 */
export interface Furniture {
  id: string;
  floorId: string;
  /** 家具カタログの種類 ID（例: 'bed-single'） */
  type: string;
  name: string;
  /** 中心座標 */
  x: Mm;
  y: Mm;
  /** 幅 */
  w: Mm;
  /** 奥行き */
  d: Mm;
  /** 高さ（3D化・将来の干渉チェック用） */
  height: Mm;
  /** 回転角（度、時計回り） */
  rotation: number;
  /** 将来の家具商品連携用。実在商品の ID（未連携は null） */
  productId: string | null;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  /** 天井高（3D化用） */
  height: Mm;
}

export type AreaUnit = 'tatami' | 'm2' | 'tsubo';

export interface ProjectSettings {
  /** スナップ用グリッド(mm)。標準は 455mm（半間 910mm の半分 = 1.5尺） */
  gridSize: Mm;
  /** 表示用の主グリッド(mm)。標準は半間 910mm（3尺。木造住宅の基本モジュール） */
  majorGridSize: Mm;
  areaUnit: AreaUnit;
  /** 1畳あたりの面積(㎡)。不動産表示規約の 1.62㎡ が標準 */
  tatamiArea: number;
  exteriorWallThickness: Mm;
  interiorWallThickness: Mm;
  /** 家具配置モードのスナップ間隔(mm) */
  furnitureGrid: Mm;
  activeFloorId: string;
}

export const PROJECT_FORMAT = 'web-madori' as const;
export const PROJECT_VERSION = 2 as const;

/** 1 つの間取り案の中身 */
export interface PlanContent {
  floors: Floor[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
  activeFloorId: string;
}

/**
 * 間取り案（A案・B案…）。
 * 編集中の案の中身は Project 直下（rooms など）にあり、その案の content は null。
 * 保存ファイルでは全案の中身が plans[] に正規化される（project.ts 参照）。
 */
export interface PlanEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  content: PlanContent | null;
}

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  projectId: string;
  projectName: string;
  /* ---- 編集中の案（activePlanId）の中身 ---- */
  floors: Floor[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
  /* ---- 案の一覧 ---- */
  activePlanId: string;
  plans: PlanEntry[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/** 部屋の辺から自動算出される壁（保存データには派生情報として出力） */
export interface WallSegment {
  id: string;
  floorId: string;
  orientation: 'h' | 'v';
  /** h: y座標 / v: x座標 */
  pos: Mm;
  start: Mm;
  end: Mm;
  /** この壁に接する部屋（共有壁なら 2 部屋） */
  rooms: { roomId: string; side: Side }[];
  exterior: boolean;
}

export interface Connection {
  a: string;
  b: string;
  /** 共有している壁の長さ */
  length: Mm;
}

export type Selection =
  | { kind: 'room'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string };

export type EditorMode = 'plan' | 'furniture';
