import { memo } from 'react';
import { outlinePath } from '../../model/customParts';
import { textWidth } from './labelLayout';
import type { CustomPart } from '../../model/types';

const FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

/** 模様（図形のローカル座標・mm 単位。図形と一緒に回転する） */
function PatternDef({ id, part }: { id: string; part: CustomPart }) {
  const c = part.stroke;
  const sw = 14;
  switch (part.pattern) {
    case 'hatch':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={200} height={200} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={200} stroke={c} strokeWidth={sw} strokeOpacity={0.5} />
        </pattern>
      );
    case 'cross':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={200} height={200} patternTransform="rotate(45)">
          <path d="M 0 0 V 200 M 0 0 H 200" stroke={c} strokeWidth={sw} strokeOpacity={0.5} fill="none" />
        </pattern>
      );
    case 'dots':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={180} height={180}>
          <circle cx={90} cy={90} r={28} fill={c} fillOpacity={0.45} />
        </pattern>
      );
    case 'grid':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={300} height={300}>
          <path d="M 300 0 L 0 0 0 300" stroke={c} strokeWidth={sw} strokeOpacity={0.45} fill="none" />
        </pattern>
      );
    case 'wood':
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={900} height={120}>
          <path d="M 0 0 H 900 M 450 0 V 120" stroke={c} strokeWidth={sw} strokeOpacity={0.45} fill="none" />
        </pattern>
      );
    default:
      return null;
  }
}

/** カスタムパーツ 1 つ（図形・模様・名前と文字） */
export const CustomPartShape = memo(function CustomPartShape({ part, prefix = '' }: { part: CustomPart; prefix?: string }) {
  const d = outlinePath(part);
  const patId = `${prefix}cpp-${part.id}`;
  const lines = [part.showName ? part.name : '', part.text ?? ''].filter((t) => t.trim());
  // 文字は図形の幅・高さに収まる大きさ（収まらないほど小さい図形では出さない）
  const maxW = part.w * (part.shape === 'rect' ? 0.9 : 0.7);
  const widest = Math.max(1, ...lines.map((l) => textWidth(l)));
  const fs = Math.min(220, maxW / widest, (part.h * 0.6) / Math.max(1, lines.length * 1.25));
  return (
    <g transform={`translate(${part.x} ${part.y}) rotate(${part.rotation})`} opacity={part.opacity} pointerEvents="none">
      {part.pattern !== 'none' && (
        <defs>
          <PatternDef id={patId} part={part} />
        </defs>
      )}
      <path d={d} fill={part.fill} stroke="none" />
      {part.pattern !== 'none' && <path d={d} fill={`url(#${patId})`} stroke="none" />}
      {part.strokeWidth > 0 && <path d={d} fill="none" stroke={part.stroke} strokeWidth={part.strokeWidth} strokeLinejoin="round" />}
      {fs >= 60 && lines.length > 0 && (
        <g transform={`rotate(${-part.rotation})`} fontFamily={FONT} textAnchor="middle" fill="#2d2a26">
          {lines.map((l, i) => (
            <text
              key={i}
              x={0}
              y={(i - (lines.length - 1) / 2) * fs * 1.25 + fs * 0.35}
              fontSize={i === 0 && part.showName ? fs : fs * 0.85}
              fontWeight={i === 0 && part.showName ? 600 : 400}
              paintOrder="stroke"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={fs * 0.18}
            >
              {l}
            </text>
          ))}
        </g>
      )}
    </g>
  );
});

export function CustomPartLayer({ items, prefix = '' }: { items: CustomPart[]; prefix?: string }) {
  return (
    <g>
      {items.map((p) => (
        <CustomPartShape key={p.id} part={p} prefix={prefix} />
      ))}
    </g>
  );
}
