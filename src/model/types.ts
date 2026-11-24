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
  'balcony',
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
  /** 参考情報（画像・URL・メモ）。図面には描かず、選んだときに表示する */
  info?: PartInfo;
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
  info?: PartInfo;
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
  info?: PartInfo;
}

/**
 * パーツに添付する参考情報（画像・URL・メモ）。すべて任意。
 * 図面（キャンバス・PNG・PDF）には描かず、パーツを選んだときに詳細として表示する。
 */
export interface PartInfo {
  title?: string;
  productName?: string;
  description?: string;
  /** 価格（円） */
  price?: number;
  /** 寸法・仕様 */
  specs?: string;
  memo?: string;
  links: PartLink[];
  images: PartImage[];
}

export interface PartLink {
  /** http / https のみ */
  url: string;
  label?: string;
}

/**
 * 画像。url = 外部の画像（https のみ）、embedded = 端末の写真を縮小して間取りデータに埋め込んだもの
 * （data:image/jpeg|png|webp;base64 のみ。SVG は不可）
 */
export interface PartImage {
  id: string;
  kind: 'url' | 'embedded';
  src: string;
  caption?: string;
}

export const CUSTOM_SHAPES = ['rect', 'circle', 'ellipse', 'polygon', 'freehand'] as const;
export type CustomShape = (typeof CUSTOM_SHAPES)[number];
export const CUSTOM_PATTERNS = ['none', 'hatch', 'cross', 'dots', 'grid', 'wood'] as const;
export type CustomPattern = (typeof CUSTOM_PATTERNS)[number];

/** カスタムパーツの形と見た目（パーツライブラリにも同じ形で保存する） */
export interface CustomPartDesign {
  name: string;
  shape: CustomShape;
  /**
   * polygon / freehand の頂点。幅・高さを 1 とした中心基準の座標（-0.5〜0.5）。
   * 大きさを変えると頂点もそれに合わせて伸び縮みする
   */
  points?: [number, number][];
  fill: string;
  stroke: string;
  /** 枠線の太さ (mm) */
  strokeWidth: number;
  /** 0〜1 */
  opacity: number;
  pattern: CustomPattern;
  /** 図形の中に書く文字（任意） */
  text?: string;
  /** パーツ名を図形の中に表示するか */
  showName: boolean;
}

/**
 * カスタムパーツ（利用者が作る図形）。部屋・家具とは別のデータとして持つ。
 * 中心座標・幅(w)・高さ(h)・回転（度）は家具と同じ扱い。
 */
export interface CustomPart extends CustomPartDesign {
  id: string;
  floorId: string;
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  rotation: number;
  /** パーツライブラリから置いた場合の元 ID（記録用。ライブラリを変えても配置済みのパーツは変わらない） */
  libraryId: string | null;
  info?: PartInfo;
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
/**
 * 形式のバージョン。
 * 1: 初版 / 2: 複数案 / 3: カスタムパーツ・パーツの参考情報（画像・URL・メモ）を追加
 * 新しい項目を古いアプリで読み込むと黙って捨てられるため、項目を追加したら上げる（古いアプリは読み込みを拒否する）
 */
export const PROJECT_VERSION = 3 as const;

/** 1 つの間取り案の中身 */
export interface PlanContent {
  floors: Floor[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
  customParts: CustomPart[];
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
  customParts: CustomPart[];
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
  | { kind: 'furniture'; id: string }
  | { kind: 'custom'; id: string };

export type EditorMode = 'plan' | 'furniture';
