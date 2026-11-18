import { describe, expect, it } from 'vitest';
import {
  computeConnections,
  computeWalls,
  findAdjacentPlacement,
  findFreeSpot,
  nearestWall,
  rectsOverlap,
  rehostOpening,
  resizeRect,
  rotateOpeningCW,
  snapMove,
} from './geometry';
import { createOpening, createRoom } from './project';
import type { Room } from './types';

const F = 'f1';
const room = (x: number, y: number, w: number, h: number, type: Room['type'] = 'room') =>
  createRoom(type, { x, y, w, h }, F);

describe('rectsOverlap', () => {
  it('接しているだけなら重ならない', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('食い込めば重なる', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });
});

describe('computeWalls（共通壁）', () => {
  it('単独の部屋は外壁 4 本', () => {
    const walls = computeWalls([room(0, 0, 2730, 3640)], F);
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => w.exterior)).toBe(true);
  });

  it('隣接する部屋の共通壁は 1 本だけ生成され、内壁になる', () => {
    const a = room(0, 0, 2730, 3640);
    const b = room(2730, 0, 2730, 3640);
    const walls = computeWalls([a, b], F);
    const shared = walls.filter((w) => w.orientation === 'v' && w.pos === 2730);
    expect(shared).toHaveLength(1);
    expect(shared[0].exterior).toBe(false);
    expect(shared[0].rooms.map((r) => r.roomId).sort()).toEqual([a.id, b.id].sort());
    // 上辺は 2 部屋分が別々の外壁（隣接集合が異なるため）
    const top = walls.filter((w) => w.orientation === 'h' && w.pos === 0);
    expect(top.reduce((s, w) => s + (w.end - w.start), 0)).toBe(5460);
  });

  it('一部だけ接する場合は接している区間のみ内壁', () => {
    const a = room(0, 0, 2730, 3640);
    const b = room(2730, 1820, 1820, 3640);
    const walls = computeWalls([a, b], F);
    const line = walls.filter((w) => w.orientation === 'v' && w.pos === 2730).sort((x, y) => x.start - y.start);
    expect(line.map((w) => [w.start, w.end, w.exterior])).toEqual([
      [0, 1820, true],
      [1820, 3640, false],
      [3640, 5460, true],
    ]);
    const conns = computeConnections(walls);
    expect(conns).toHaveLength(1);
    expect(conns[0].length).toBe(1820);
  });
});

describe('findAdjacentPlacement（上下左右への追加）', () => {
  const base = room(0, 0, 2730, 3640);
  it.each([
    ['right', { x: 2730, y: 0 }],
    ['left', { x: -1820, y: 0 }],
    ['bottom', { x: 0, y: 3640 }],
    ['top', { x: 0, y: -1820 }],
  ] as const)('%s 側に辺を揃えて配置する', (dir, pos) => {
    const r = findAdjacentPlacement(base, dir, 1820, 1820, [base], 455);
    expect(r).toMatchObject({ ...pos, w: 1820, h: 1820 });
  });

  it('塞がっている場合は辺に沿ってずらし、既存の部屋は動かさない', () => {
    const blocker = room(2730, 0, 1820, 1820);
    const r = findAdjacentPlacement(base, 'right', 1820, 1820, [base, blocker], 455);
    expect(r).toMatchObject({ x: 2730, y: 1820 });
    expect(blocker.x).toBe(2730);
  });

  it('完全に塞がっていれば null', () => {
    const blocker = room(2730, -5000, 5000, 15000);
    expect(findAdjacentPlacement(base, 'right', 1820, 1820, [base, blocker], 455)).toBeNull();
  });

  it('追加した部屋は元の部屋と共通壁を持つ', () => {
    const r = findAdjacentPlacement(base, 'bottom', 2730, 1820, [base], 455)!;
    const added = room(r.x, r.y, r.w, r.h);
    const conns = computeConnections(computeWalls([base, added], F));
    expect(conns).toHaveLength(1);
  });
});

describe('nearestWall（開口部の配置）', () => {
  const a = room(0, 0, 2730, 3640);
  it('壁の近くなら辺と位置を返す', () => {
    const hit = nearestWall({ x: 1365, y: 30 }, [a], 910, 200);
    expect(hit).toMatchObject({ roomId: a.id, side: 'top', width: 910 });
    expect(hit!.offset).toBeCloseTo(1365 - 455);
  });
  it('壁から離れた場所には配置できない', () => {
    expect(nearestWall({ x: 1365, y: 1800 }, [a], 910, 200)).toBeNull();
  });
  it('辺からはみ出さないように位置を制限する', () => {
    const hit = nearestWall({ x: 2700, y: 0 }, [a], 910, 200)!;
    expect(hit.offset + hit.width).toBeLessThanOrEqual(2730);
  });
});

describe('部屋の回転・削除に伴う開口部', () => {
  it('時計回りに回転すると上辺の開口部は右辺に移る', () => {
    const a = room(0, 0, 2730, 3640);
    const o = createOpening('door', { roomId: a.id, side: 'top', offset: 100, width: 780 }, F);
    const r = rotateOpeningCW(o, a);
    expect(r.side).toBe('right');
    expect(r.offset).toBe(100);
    const r2 = rotateOpeningCW(r, { ...a, w: 3640, h: 2730 });
    expect(r2.side).toBe('bottom');
    expect(r2.offset).toBe(2730 - 100 - 780);
  });

  it('共有壁上のドアは削除時に隣の部屋へ引き継がれる', () => {
    const a = room(0, 0, 2730, 3640);
    const b = room(2730, 0, 2730, 3640);
    const o = createOpening('door', { roomId: a.id, side: 'right', offset: 500, width: 780 }, F);
    const moved = rehostOpening(o, a, [b]);
    expect(moved).toMatchObject({ roomId: b.id, side: 'left', offset: 500, swing: 'out' });
  });

  it('外壁上の窓は削除時に消える', () => {
    const a = room(0, 0, 2730, 3640);
    const b = room(2730, 0, 2730, 3640);
    const o = createOpening('window', { roomId: a.id, side: 'left', offset: 500, width: 910 }, F);
    expect(rehostOpening(o, a, [b])).toBeNull();
  });
});

describe('スナップ', () => {
  it('移動時は近くの部屋の辺に吸着する', () => {
    const other = room(0, 0, 2730, 3640);
    const r = snapMove({ x: 2700, y: 20, w: 1820, h: 1820 }, [other], 455, 100);
    expect(r).toMatchObject({ x: 2730, y: 0 });
  });
  it('リサイズは最小サイズを下回らない', () => {
    const r = resizeRect({ x: 0, y: 0, w: 2730, h: 3640 }, 'e', { x: -500, y: 0 }, [], 455, 50, 455);
    expect(r.w).toBe(455);
  });
  it('空き位置探索は重ならない位置を返す', () => {
    const a = room(0, 0, 2730, 3640);
    const r = findFreeSpot({ x: 0, y: 0, w: 1820, h: 1820 }, [a], 455)!;
    expect(rectsOverlap(r, a)).toBe(false);
  });
});
