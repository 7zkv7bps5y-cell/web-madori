import type { ReactNode } from 'react';
import type { Room, RoomType } from '../../model/types';

const STROKE = '#6b6458';
const SW = 18; // mm 単位の線幅

/** 設備が「奥の壁」側に占める奥行き（ラベル位置の調整用） */
export function fixtureDepth(type: RoomType, lh: number): number {
  switch (type) {
    case 'bath':
      return Math.min(800, lh * 0.45) + 100;
    case 'toilet':
      return Math.min(720, lh * 0.6);
    case 'kitchen':
      return 650;
    case 'washroom':
    case 'dressing':
      return 600;
    default:
      return 0;
  }
}

export function localSize(room: Room): { lw: number; lh: number } {
  return room.rotation % 180 === 0 ? { lw: room.w, lh: room.h } : { lw: room.h, lh: room.w };
}

/** 部屋のローカル座標（回転を考慮）→ ワールド座標 */
export function localToWorld(room: Room, lx: number, ly: number): { x: number; y: number } {
  const { lw, lh } = localSize(room);
  const dx = lx - lw / 2;
  const dy = ly - lh / 2;
  const rad = (room.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return {
    x: room.x + room.w / 2 + dx * cos - dy * sin,
    y: room.y + room.h / 2 + dx * sin + dy * cos,
  };
}

function Sink({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={60} fill="#fff" stroke={STROKE} strokeWidth={SW} />
      <circle cx={x + w / 2} cy={y + h / 2} r={25} fill={STROKE} />
    </g>
  );
}

function KitchenCounter({ x, w }: { x: number; w: number }) {
  const d = 650;
  const sinkW = Math.min(750, w * 0.3);
  return (
    <g>
      <rect x={x} y={0} width={w} height={d} fill="#fff" stroke={STROKE} strokeWidth={SW} />
      <Sink x={x + w * 0.12} y={90} w={sinkW} h={d - 200} />
      {w > 1400 &&
        [0, 1].map((i) => (
          <circle
            key={i}
            cx={x + w * 0.72 + (i ? 260 : 0)}
            cy={d / 2}
            r={110}
            fill="none"
            stroke={STROKE}
            strokeWidth={SW}
          />
        ))}
    </g>
  );
}

function fixtureBody(type: RoomType, lw: number, lh: number): ReactNode {
  switch (type) {
    case 'bath': {
      const pad = 80;
      const d = Math.min(800, lh * 0.45);
      return (
        <g>
          <rect x={pad} y={pad} width={lw - pad * 2} height={d} rx={100} fill="#fff" stroke={STROKE} strokeWidth={SW} />
          <rect x={pad + 70} y={pad + 70} width={lw - pad * 2 - 140} height={d - 140} rx={70} fill="#eaf6fa" stroke={STROKE} strokeWidth={SW} />
        </g>
      );
    }
    case 'toilet': {
      const tw = Math.min(440, lw * 0.6);
      const cx = lw / 2;
      return (
        <g>
          <rect x={cx - tw / 2} y={40} width={tw} height={180} rx={30} fill="#fff" stroke={STROKE} strokeWidth={SW} />
          <ellipse cx={cx} cy={220 + 230} rx={Math.min(190, lw * 0.25)} ry={240} fill="#fff" stroke={STROKE} strokeWidth={SW} />
          <ellipse cx={cx} cy={220 + 250} rx={Math.min(110, lw * 0.15)} ry={150} fill="none" stroke={STROKE} strokeWidth={SW} />
        </g>
      );
    }
    case 'kitchen':
      return <KitchenCounter x={0} w={lw} />;
    case 'ldk':
    case 'dk': {
      const w = Math.min(2550, lw * 0.5);
      return <KitchenCounter x={lw - w} w={w} />;
    }
    case 'washroom': {
      const w = Math.min(750, lw - 100);
      return (
        <g>
          <rect x={60} y={0} width={w} height={550} fill="#fff" stroke={STROKE} strokeWidth={SW} />
          <ellipse cx={60 + w / 2} cy={280} rx={w * 0.32} ry={170} fill="#eaf6fa" stroke={STROKE} strokeWidth={SW} />
        </g>
      );
    }
    case 'dressing': {
      const w = Math.min(750, lw * 0.45);
      const m = Math.min(640, lw - w - 80);
      return (
        <g>
          <rect x={40} y={0} width={w} height={550} fill="#fff" stroke={STROKE} strokeWidth={SW} />
          <ellipse cx={40 + w / 2} cy={280} rx={w * 0.32} ry={170} fill="#eaf6fa" stroke={STROKE} strokeWidth={SW} />
          {m > 300 && (
            <g>
              <rect x={lw - m - 40} y={20} width={m} height={m} rx={40} fill="#fff" stroke={STROKE} strokeWidth={SW} />
              <circle cx={lw - m / 2 - 40} cy={20 + m / 2} r={m * 0.32} fill="none" stroke={STROKE} strokeWidth={SW} />
            </g>
          )}
        </g>
      );
    }
    case 'closet': {
      const vertical = lh > lw;
      return vertical ? (
        <line x1={lw / 2} y1={60} x2={lw / 2} y2={lh - 60} stroke={STROKE} strokeWidth={SW} strokeDasharray="120 80" />
      ) : (
        <line x1={60} y1={lh / 2} x2={lw - 60} y2={lh / 2} stroke={STROKE} strokeWidth={SW} strokeDasharray="120 80" />
      );
    }
    case 'stairs': {
      const vertical = lh >= lw;
      const len = vertical ? lh : lw;
      const steps = Math.max(2, Math.round(len / 227.5));
      const step = len / steps;
      const lines = [];
      for (let i = 1; i < steps; i++) {
        const t = i * step;
        lines.push(
          vertical ? (
            <line key={i} x1={0} y1={t} x2={lw} y2={t} stroke={STROKE} strokeWidth={SW} />
          ) : (
            <line key={i} x1={t} y1={0} x2={t} y2={lh} stroke={STROKE} strokeWidth={SW} />
          ),
        );
      }
      // 上り方向（奥側）への矢印
      const arrow = vertical ? (
        <path
          d={`M ${lw / 2} ${lh - step / 2} L ${lw / 2} ${step / 2} M ${lw / 2 - 120} ${step / 2 + 160} L ${lw / 2} ${step / 2} L ${lw / 2 + 120} ${step / 2 + 160}`}
          fill="none"
          stroke={STROKE}
          strokeWidth={SW * 1.4}
        />
      ) : (
        <path
          d={`M ${step / 2} ${lh / 2} L ${lw - step / 2} ${lh / 2} M ${lw - step / 2 - 160} ${lh / 2 - 120} L ${lw - step / 2} ${lh / 2} L ${lw - step / 2 - 160} ${lh / 2 + 120}`}
          fill="none"
          stroke={STROKE}
          strokeWidth={SW * 1.4}
        />
      );
      return (
        <g>
          {lines}
          {arrow}
        </g>
      );
    }
    default:
      return null;
  }
}

export function RoomFixtures({ room }: { room: Room }) {
  const { lw, lh } = localSize(room);
  const body = fixtureBody(room.type, lw, lh);
  if (!body) return null;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${room.rotation}) translate(${-lw / 2} ${-lh / 2})`}
      pointerEvents="none"
    >
      {body}
    </g>
  );
}
