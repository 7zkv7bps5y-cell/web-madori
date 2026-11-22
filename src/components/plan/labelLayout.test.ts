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
