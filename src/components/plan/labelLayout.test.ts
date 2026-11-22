import { describe, expect, it } from 'vitest';
import { createRoom } from '../../model/project';
import { layoutRoomLabel, textWidth } from './labelLayout';

const room = (type: Parameters<typeof createRoom>[0], w: number, h: number, rotation: 0 | 90 | 180 | 270 = 0) => ({
  ...createRoom(type, { x: 0, y: 0, w, h }, 'f'),
  rotation,
});
const opts = { areaUnit: 'tatami' as const, tatamiArea: 1.62 };

describe('部屋ラベルの配置', () => {
  it('編集画面では画面上 10〜14px 相当の大きさになる（ズームに追従）', () => {
    for (const zoom of [0.03, 0.08, 0.3]) {
      const l = layoutRoomLabel(room('bedroom', 3640, 3640), { ...opts, mode: 'normal', zoom })!;
      expect(l).not.toBeNull();
      const px = l.lines[0].size * zoom;
      expect(px).toBeGreaterThanOrEqual(8.5);
      expect(px).toBeLessThanOrEqual(14.01);
    }
  });

  it('文字は部屋の幅に収まる', () => {
    const r = room('kids', 1820, 3640);
    const l = layoutRoomLabel(r, { ...opts, mode: 'dimensions' })!;
    for (const line of l.lines) {
      const w = textWidth(line.text) * line.size;
      expect(l.x - w / 2).toBeGreaterThanOrEqual(r.x);
      expect(l.x + w / 2).toBeLessThanOrEqual(r.x + r.w);
    }
  });

  it('寸法モードでは寸法と畳数・㎡を表示', () => {
    const l = layoutRoomLabel(room('bedroom', 3640, 3640), { ...opts, mode: 'dimensions' })!;
    expect(l.lines.map((x) => x.kind)).toEqual(['name', 'dims', 'area']);
    expect(l.lines[1].text).toBe('3,640×3,640');
    expect(l.lines[2].text).toContain('㎡');
  });

  it('小さい部屋では優先度の低い行から省く', () => {
    const big = layoutRoomLabel(room('bedroom', 3640, 3640), { ...opts, mode: 'dimensions', zoom: 0.05 })!;
    const small = layoutRoomLabel(room('storage', 910, 910), { ...opts, mode: 'dimensions', zoom: 0.05 });
    expect(big.lines.length).toBe(3);
    expect(small === null || small.lines.length < 3).toBe(true);
  });

  it('設備（浴槽）を避けて配置する', () => {
    const r = room('bath', 1820, 1820, 180); // 浴槽は下側
    const l = layoutRoomLabel(r, { ...opts, mode: 'normal' })!;
    expect(l.y).toBeLessThan(r.h / 2);
  });

  it('部屋名・広さを非表示にした部屋はラベルなし', () => {
    const r = room('room', 2730, 2730);
    r.style = { ...r.style, showLabel: false, showArea: false };
    expect(layoutRoomLabel(r, { ...opts, mode: 'normal' })).toBeNull();
  });
});

import { createOpening, createProject } from '../../model/project';
import { clippedArea, doorSwingObstacles } from './labelLayout';

/** ラベル全体の外枠（目安）と、避ける場所との重なり割合 */
function overlapRatio(l: NonNullable<ReturnType<typeof layoutRoomLabel>>, obstacles: { x: number; y: number }[][]) {
  const w = Math.max(...l.lines.map((x) => textWidth(x.text) * x.size));
  const first = l.lines[0];
  const last = l.lines[l.lines.length - 1];
  const top = l.y - first.size * 0.85;
  const bottom = l.y + last.dy + last.size * 0.3;
  const box = { x: l.x - w / 2, y: top, w, h: bottom - top };
  return obstacles.reduce((s, p) => s + clippedArea(p, box), 0) / (box.w * box.h);
}

describe('ドアの開閉範囲を避けた配置', () => {
  const setup = (w: number, h: number, doors: { side: 'top' | 'left' | 'right' | 'bottom'; offset: number; width: number }[]) => {
    const p = createProject();
    const f = p.settings.activeFloorId;
    const r = { ...createRoom('dressing', { x: 0, y: 0, w, h }, f), style: { ...createRoom('room', { x: 0, y: 0, w, h }, f).style, showFixtures: false } };
    p.rooms = [r];
    p.openings = doors.map((d) => createOpening('door', { roomId: r.id, ...d }, f));
    return { p, r, obstacles: doorSwingObstacles(p, f) };
  };

  it('切り取り面積の計算', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(clippedArea(sq, { x: 5, y: 5, w: 10, h: 10 })).toBeCloseTo(25);
    expect(clippedArea(sq, { x: 20, y: 20, w: 5, h: 5 })).toBe(0);
  });

  it('ドアがなければ従来どおり中央', () => {
    const { r, obstacles } = setup(1820, 1820, []);
    const l = layoutRoomLabel(r, { ...opts, mode: 'dimensions', obstacles })!;
    expect(l.x).toBeCloseTo(910);
  });

  it('狭い部屋でもドアの開閉範囲とほぼ重ならない位置に置く（寸法付き）', () => {
    // 1,820 角の脱衣所。上辺の中央付近から内開きのドア
    const { r, obstacles } = setup(1820, 1820, [{ side: 'top', offset: 520, width: 780 }]);
    const centered = layoutRoomLabel(r, { ...opts, mode: 'dimensions' })!;
    const placed = layoutRoomLabel(r, { ...opts, mode: 'dimensions', obstacles })!;
    expect(overlapRatio(centered, obstacles)).toBeGreaterThan(0.05);
    expect(overlapRatio(placed, obstacles)).toBeLessThanOrEqual(0.05);
    // 寸法の行は残っている
    expect(placed.lines.map((x) => x.kind)).toContain('dims');
  });

  it('ドアが 2 つある廊下でも重なりを減らす', () => {
    const { r, obstacles } = setup(2730, 910, [
      { side: 'top', offset: 100, width: 780 },
      { side: 'bottom', offset: 1850, width: 780 },
    ]);
    const centered = layoutRoomLabel(r, { ...opts, mode: 'dimensions' })!;
    const placed = layoutRoomLabel(r, { ...opts, mode: 'dimensions', obstacles })!;
    expect(overlapRatio(placed, obstacles)).toBeLessThan(overlapRatio(centered, obstacles) + 1e-9);
    expect(overlapRatio(placed, obstacles)).toBeLessThanOrEqual(0.05);
  });
});
