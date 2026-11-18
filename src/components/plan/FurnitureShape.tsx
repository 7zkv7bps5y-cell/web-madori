import { memo, type ReactNode } from 'react';
import { furnitureDef } from '../../model/furnitureCatalog';
import type { Furniture } from '../../model/types';

const S = '#5b544a';
const SW = 14;

/** ローカル座標（中心 0,0 / 上 = 背面）での平面図形状 */
function body(f: Furniture): ReactNode {
  const { w, d } = f;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const fill = furnitureDef(f.type).fill;
  const base = <rect x={x0} y={y0} width={w} height={d} rx={Math.min(40, w * 0.05)} fill={fill} stroke={S} strokeWidth={SW} />;
  switch (f.type) {
    case 'bed-single':
    case 'bed-semidouble':
    case 'bed-double': {
      const pillows = w >= 1300 ? 2 : 1;
      const pw = (w - 120 - (pillows - 1) * 60) / pillows;
      return (
        <>
          {base}
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={x0 + 60 + i * (pw + 60)} y={y0 + 60} width={pw} height={Math.min(380, d * 0.2)} rx={60} fill="#fff" stroke={S} strokeWidth={SW} />
          ))}
          <path d={`M ${x0} ${y0 + d * 0.32} H ${x0 + w}`} stroke={S} strokeWidth={SW} />
          <path d={`M ${x0} ${y0 + d * 0.32} L ${x0 + w * 0.35} ${y0 + d * 0.42} L ${x0 + w} ${y0 + d * 0.32}`} fill="none" stroke={S} strokeWidth={SW * 0.7} />
        </>
      );
    }
    case 'sofa': {
      const back = Math.min(220, d * 0.28);
      const arm = Math.min(200, w * 0.14);
      const seats = Math.max(1, Math.round((w - arm * 2) / 650));
      const sw = (w - arm * 2) / seats;
      return (
        <>
          {base}
          <rect x={x0} y={y0} width={w} height={back} rx={40} fill="#d8ccb7" stroke={S} strokeWidth={SW} />
          <rect x={x0} y={y0} width={arm} height={d} rx={40} fill="#d8ccb7" stroke={S} strokeWidth={SW} />
          <rect x={x0 + w - arm} y={y0} width={arm} height={d} rx={40} fill="#d8ccb7" stroke={S} strokeWidth={SW} />
          {Array.from({ length: seats - 1 }, (_, i) => (
            <path key={i} d={`M ${x0 + arm + sw * (i + 1)} ${y0 + back} V ${y0 + d}`} stroke={S} strokeWidth={SW * 0.7} />
          ))}
        </>
      );
    }
    case 'chair':
      return (
        <>
          <rect x={x0 + w * 0.05} y={y0 + d * 0.1} width={w * 0.9} height={d * 0.85} rx={60} fill={fill} stroke={S} strokeWidth={SW} />
          <rect x={x0} y={y0} width={w} height={d * 0.18} rx={40} fill="#d4c0a0" stroke={S} strokeWidth={SW} />
        </>
      );
    case 'dining-table': {
      const n = Math.max(1, Math.round(w / 700));
      const cw = Math.min(420, w / n - 80);
      const chairs: ReactNode[] = [];
      for (let i = 0; i < n; i++) {
        const cx = x0 + (w / n) * (i + 0.5);
        chairs.push(
          <rect key={`t${i}`} x={cx - cw / 2} y={y0 - 280} width={cw} height={360} rx={50} fill="#f2e7d6" stroke={S} strokeWidth={SW * 0.8} />,
          <rect key={`b${i}`} x={cx - cw / 2} y={y0 + d - 80} width={cw} height={360} rx={50} fill="#f2e7d6" stroke={S} strokeWidth={SW * 0.8} />,
        );
      }
      return (
        <>
          {chairs}
          {base}
        </>
      );
    }
    case 'tv-stand':
      return (
        <>
          {base}
          <rect x={x0 + w * 0.15} y={y0 + d * 0.2} width={w * 0.7} height={Math.min(80, d * 0.25)} fill="#3e3b37" />
        </>
      );
    case 'tv':
      return (
        <>
          <rect x={x0} y={y0 + d * 0.3} width={w} height={d * 0.35} fill="#3e3b37" stroke={S} strokeWidth={SW} />
          <rect x={-w * 0.15} y={y0 + d * 0.55} width={w * 0.3} height={d * 0.45} fill="#6b6760" />
        </>
      );
    case 'desk':
      return (
        <>
          {base}
          <rect x={x0 + w * 0.55} y={y0 + 40} width={w * 0.4} height={d * 0.6} fill="none" stroke={S} strokeWidth={SW * 0.6} />
        </>
      );
    case 'bookshelf':
    case 'shelf':
    case 'cupboard': {
      const n = Math.max(1, Math.round(w / 450));
      return (
        <>
          {base}
          {Array.from({ length: n - 1 }, (_, i) => (
            <path key={i} d={`M ${x0 + (w / n) * (i + 1)} ${y0} V ${y0 + d}`} stroke={S} strokeWidth={SW * 0.7} />
          ))}
          <path d={`M ${x0} ${y0 + d * 0.15} H ${x0 + w}`} stroke={S} strokeWidth={SW * 0.6} />
        </>
      );
    }
    case 'wardrobe':
      return (
        <>
          {base}
          <path d={`M ${x0 + 60} ${0} H ${x0 + w - 60}`} stroke={S} strokeWidth={SW} strokeDasharray="80 60" />
          <path d={`M 0 ${y0} V ${y0 + d}`} stroke={S} strokeWidth={SW * 0.6} />
        </>
      );
    case 'fridge':
    case 'microwave':
      return (
        <>
          {base}
          <path d={`M ${x0 + w * 0.12} ${y0 + d - 60} H ${x0 + w * 0.88}`} stroke={S} strokeWidth={SW * 1.4} strokeLinecap="round" />
          <text x={0} y={d * 0.05} fontSize={Math.min(w, d) * 0.3} textAnchor="middle" fill={S} fontFamily="sans-serif">
            {f.type === 'fridge' ? '冷' : 'レ'}
          </text>
        </>
      );
    case 'washer':
      return (
        <>
          {base}
          <circle cx={0} cy={d * 0.05} r={Math.min(w, d) * 0.32} fill="#fff" stroke={S} strokeWidth={SW} />
          <rect x={x0 + 40} y={y0 + 30} width={w - 80} height={d * 0.12} rx={20} fill="none" stroke={S} strokeWidth={SW * 0.6} />
        </>
      );
    case 'aircon':
      return (
        <>
          <rect x={x0} y={y0} width={w} height={d} rx={60} fill={fill} stroke={S} strokeWidth={SW} strokeDasharray="50 30" />
          <path d={`M ${x0 + 60} ${y0 + d * 0.7} H ${x0 + w - 60}`} stroke={S} strokeWidth={SW * 0.7} />
        </>
      );
    case 'kitchen-unit':
      return (
        <>
          {base}
          <rect x={x0 + w * 0.1} y={y0 + 90} width={Math.min(750, w * 0.3)} height={d - 200} rx={50} fill="#eaf6fa" stroke={S} strokeWidth={SW} />
          {w > 1400 &&
            [0, 1].map((i) => (
              <circle key={i} cx={x0 + w * 0.72 + i * 260} cy={0} r={110} fill="none" stroke={S} strokeWidth={SW} />
            ))}
        </>
      );
    case 'washbasin':
      return (
        <>
          {base}
          <ellipse cx={0} cy={d * 0.05} rx={w * 0.32} ry={d * 0.3} fill="#eaf6fa" stroke={S} strokeWidth={SW} />
        </>
      );
    case 'bathtub':
      return (
        <>
          {base}
          <rect x={x0 + 70} y={y0 + 70} width={w - 140} height={d - 140} rx={90} fill="#eaf6fa" stroke={S} strokeWidth={SW} />
        </>
      );
    case 'toilet-unit':
      return (
        <>
          <rect x={x0} y={y0} width={w} height={d * 0.26} rx={30} fill={fill} stroke={S} strokeWidth={SW} />
          <ellipse cx={0} cy={y0 + d * 0.26 + d * 0.36} rx={w * 0.45} ry={d * 0.36} fill={fill} stroke={S} strokeWidth={SW} />
        </>
      );
    default:
      return base;
  }
}

export const FurnitureShape = memo(function FurnitureShape({ f, warn }: { f: Furniture; warn?: boolean }) {
  return (
    <g transform={`translate(${f.x} ${f.y}) rotate(${f.rotation})`} pointerEvents="none">
      {body(f)}
      {warn && (
        <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} fill="rgba(214,69,48,0.12)" stroke="#d64530" strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
});

export function FurnitureLayer({ items, warnIds }: { items: Furniture[]; warnIds?: Set<string> }) {
  // 壁掛け（エアコン）は最前面
  const sorted = [...items].sort((a, b) => Number(!!furnitureDef(a.type).wallMounted) - Number(!!furnitureDef(b.type).wallMounted));
  return (
    <g>
      {sorted.map((f) => (
        <FurnitureShape key={f.id} f={f} warn={warnIds?.has(f.id)} />
      ))}
    </g>
  );
}
