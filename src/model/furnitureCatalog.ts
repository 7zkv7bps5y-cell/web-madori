export type FurnitureCategory = 'furniture' | 'appliance' | 'fixture';

export interface FurnitureDef {
  type: string;
  label: string;
  category: FurnitureCategory;
  /** 標準の実寸 (mm) 幅・奥行き・高さ */
  w: number;
  d: number;
  height: number;
  fill: string;
  /** 壁掛け（エアコンなど）: 床置き家具・壁との干渉チェックから除外 */
  wallMounted?: boolean;
}

export const FURNITURE_CATEGORIES: { key: FurnitureCategory; label: string }[] = [
  { key: 'furniture', label: '家具' },
  { key: 'appliance', label: '家電' },
  { key: 'fixture', label: '設備' },
];

export const FURNITURE_DEFS: FurnitureDef[] = [
  { type: 'bed-single', label: 'シングルベッド', category: 'furniture', w: 970, d: 1950, height: 450, fill: '#e9eef8' },
  { type: 'bed-semidouble', label: 'セミダブルベッド', category: 'furniture', w: 1200, d: 1950, height: 450, fill: '#e9eef8' },
  { type: 'bed-double', label: 'ダブルベッド', category: 'furniture', w: 1400, d: 1950, height: 450, fill: '#e9eef8' },
  { type: 'sofa', label: 'ソファ', category: 'furniture', w: 1800, d: 850, height: 800, fill: '#e6dccb' },
  { type: 'table', label: 'テーブル', category: 'furniture', w: 1000, d: 500, height: 400, fill: '#e8d6bb' },
  { type: 'chair', label: '椅子', category: 'furniture', w: 450, d: 500, height: 800, fill: '#e8d6bb' },
  { type: 'tv-stand', label: 'テレビ台', category: 'furniture', w: 1500, d: 400, height: 450, fill: '#d9cbb5' },
  { type: 'desk', label: 'デスク', category: 'furniture', w: 1000, d: 600, height: 720, fill: '#e8d6bb' },
  { type: 'bookshelf', label: '本棚', category: 'furniture', w: 900, d: 300, height: 1800, fill: '#d9cbb5' },
  { type: 'shelf', label: '収納棚', category: 'furniture', w: 800, d: 400, height: 900, fill: '#d9cbb5' },
  { type: 'wardrobe', label: 'クローゼット', category: 'furniture', w: 900, d: 600, height: 1800, fill: '#d9cbb5' },
  { type: 'cupboard', label: '食器棚', category: 'furniture', w: 1000, d: 450, height: 1800, fill: '#d9cbb5' },
  { type: 'fridge', label: '冷蔵庫', category: 'appliance', w: 650, d: 700, height: 1800, fill: '#eef1f3' },
  { type: 'washer', label: '洗濯機', category: 'appliance', w: 600, d: 600, height: 1000, fill: '#eef1f3' },
  { type: 'microwave', label: '電子レンジ', category: 'appliance', w: 500, d: 400, height: 300, fill: '#eef1f3' },
  { type: 'tv', label: 'テレビ', category: 'appliance', w: 1200, d: 250, height: 700, fill: '#3e3b37' },
  { type: 'aircon', label: 'エアコン', category: 'appliance', w: 800, d: 250, height: 290, fill: '#f4f6f8', wallMounted: true },
  { type: 'dining-table', label: 'ダイニングテーブル', category: 'fixture', w: 1350, d: 800, height: 720, fill: '#e8d6bb' },
  { type: 'kitchen-unit', label: 'キッチン設備', category: 'fixture', w: 2550, d: 650, height: 850, fill: '#f6f6f4' },
  { type: 'washbasin', label: '洗面台', category: 'fixture', w: 750, d: 550, height: 800, fill: '#f6f6f4' },
  { type: 'bathtub', label: '浴槽', category: 'fixture', w: 1600, d: 800, height: 600, fill: '#f6f6f4' },
  { type: 'toilet-unit', label: 'トイレ', category: 'fixture', w: 400, d: 700, height: 750, fill: '#f6f6f4' },
];

const MAP = new Map(FURNITURE_DEFS.map((d) => [d.type, d]));
const FALLBACK: FurnitureDef = { type: 'generic', label: '家具', category: 'furniture', w: 600, d: 600, height: 700, fill: '#e8d6bb' };

export function furnitureDef(type: string): FurnitureDef {
  return MAP.get(type) ?? FALLBACK;
}
