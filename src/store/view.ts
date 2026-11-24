import { create } from 'zustand';

/** 表示倍率。zoom は「1mm あたりの画面ピクセル数」で、ZOOM_100 を 100% と表示する（実寸データは変えない） */
export const ZOOM_100 = 0.1;
export const MIN_ZOOM = 0.01; // 10%
export const MAX_ZOOM = 1.5; // 1500%
export const ZOOM_STEP = 1.25;
export const zoomPercent = (z: number) => Math.round((z / ZOOM_100) * 100);

interface ViewState {
  /** 1mm あたりの画面ピクセル数 */
  zoom: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
  /** 増えるたびに Canvas が全体表示を行う */
  fitSeq: number;
  /** 家具配置モード: すべての家具の寸法を表示 */
  showDims: boolean;
  /** 家具配置モード: 生活動線チェックの結果を図に表示 */
  showFlow: boolean;
  /** 上の階を編集中、下の階を薄く表示する */
  showBelow: boolean;
  /** 部屋の寸法（横×縦）・畳数・面積を常に表示 */
  showRoomDims: boolean;
  /** 描きかけのカスタムパーツ（多角形の頂点・自由描画の線。ワールド座標） */
  draft: { x: number; y: number }[];
  set: (v: Partial<Pick<ViewState, 'zoom' | 'panX' | 'panY' | 'width' | 'height' | 'showDims' | 'showFlow' | 'showBelow' | 'showRoomDims' | 'draft'>>) => void;
  zoomAt: (factor: number, sx?: number, sy?: number) => void;
  /** 画面の中心を保ったまま 100% に戻す */
  zoomReset: () => void;
  requestFit: () => void;
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const useView = create<ViewState>((set, get) => ({
  zoom: 0.1,
  panX: 0,
  panY: 0,
  width: 800,
  height: 600,
  fitSeq: 0,
  showDims: false,
  showFlow: true,
  showBelow: true,
  showRoomDims: false,
  draft: [],
  set: (v) => set(v),
  zoomAt: (factor, sx, sy) => {
    const { zoom, panX, panY, width, height } = get();
    const cx = sx ?? width / 2;
    const cy = sy ?? height / 2;
    const nz = clampZoom(zoom * factor);
    const k = nz / zoom;
    set({ zoom: nz, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k });
  },
  zoomReset: () => {
    const { zoom } = get();
    get().zoomAt(ZOOM_100 / zoom);
  },
  requestFit: () => set({ fitSeq: get().fitSeq + 1 }),
}));
