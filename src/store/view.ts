import { create } from 'zustand';

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 1.5;

interface ViewState {
  /** 1mm あたりの画面ピクセル数 */
  zoom: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
  /** 増えるたびに Canvas が全体表示を行う */
  fitSeq: number;
  set: (v: Partial<Pick<ViewState, 'zoom' | 'panX' | 'panY' | 'width' | 'height'>>) => void;
  zoomAt: (factor: number, sx?: number, sy?: number) => void;
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
  set: (v) => set(v),
  zoomAt: (factor, sx, sy) => {
    const { zoom, panX, panY, width, height } = get();
    const cx = sx ?? width / 2;
    const cy = sy ?? height / 2;
    const nz = clampZoom(zoom * factor);
    const k = nz / zoom;
    set({ zoom: nz, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k });
  },
  requestFit: () => set({ fitSeq: get().fitSeq + 1 }),
}));
