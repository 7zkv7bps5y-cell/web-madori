import { describe, expect, it } from 'vitest';
import { checkFurniture, furnitureAabb, polygonsIntersect, furnitureCorners } from './collision';
import { angleFromPointer, resizeFurniture, snapFurnitureMove } from './furnitureGeom';
import { createFurniture, createProject, createRoom } from './project';
import type { Furniture, Project } from './types';

function setup(furniture: Furniture[] = []): Project {
  const p = createProject();
  const f = p.settings.activeFloorId;
  return {
    ...p,
    rooms: [createRoom('living', { x: 0, y: 0, w: 3640, h: 3640 }, f), createRoom('bedroom', { x: 3640, y: 0, w: 3640, h: 3640 }, f)],
    furniture,
  };
}
const fur = (type: string, x: number, y: number, rotation = 0) => ({ ...createFurniture(type, { x, y }, 'x'), rotation });

describe('家具の干渉チェック', () => {
  it('離れた家具は問題なし', () => {
    const p = setup();
    const f = p.settings.activeFloorId;
    p.furniture = [{ ...fur('sofa', 1500, 1500), floorId: f }];
    expect(checkFurniture(p).size).toBe(0);
  });

  it('家具同士の重なりを検出する（回転も考慮）', () => {
    const p = setup();
    const f = p.settings.activeFloorId;
    const a = { ...fur('sofa', 1500, 1500), floorId: f };
    const b = { ...fur('table', 1500, 1900, 45), floorId: f };
    p.furniture = [a, b];
    const r = checkFurniture(p);
    expect(r.get(a.id)).toContainEqual({ kind: 'overlap', otherId: b.id });
  });

  it('接しているだけなら重なりにしない', () => {
    expect(
      polygonsIntersect(
        furnitureCorners({ x: 0, y: 0, w: 100, d: 100, rotation: 0 }),
        furnitureCorners({ x: 100, y: 0, w: 100, d: 100, rotation: 0 }),
      ),
    ).toBe(false);
  });

  it('壁をまたぐ家具と部屋の外の家具を検出する', () => {
    const p = setup();
    const f = p.settings.activeFloorId;
    const onWall = { ...fur('bed-double', 3640, 1500), floorId: f };
    const outside = { ...fur('chair', 9000, 9000), floorId: f };
    p.furniture = [onWall, outside];
    const r = checkFurniture(p);
    expect(r.get(onWall.id)).toContainEqual({ kind: 'wall' });
    expect(r.get(outside.id)).toContainEqual({ kind: 'outside' });
  });

  it('壁に付けたエアコンは干渉扱いにしない', () => {
    const p = setup();
    const f = p.settings.activeFloorId;
    p.furniture = [{ ...fur('aircon', 1500, 100), floorId: f }];
    expect(checkFurniture(p).size).toBe(0);
  });

  it('ドアの開口部では壁との干渉にならない', () => {
    const p = setup();
    const f = p.settings.activeFloorId;
    p.openings = [{ id: 'o', floorId: f, type: 'door', roomId: p.rooms[0].id, side: 'right', offset: 1000, width: 900, hinge: 'start', swing: 'in' }];
    // 開口部の中にちょうど収まる小さな家具
    p.furniture = [{ ...fur('chair', 3640, 1450), w: 200, d: 200, floorId: f }];
    expect(checkFurniture(p).get(p.furniture[0].id)?.some((i) => i.kind === 'wall') ?? false).toBe(false);
  });
});

describe('家具の移動・リサイズ・回転', () => {
  it('壁の内側の面にぴったり吸着する', () => {
    const f = fur('bookshelf', 1000, 220); // 奥行 300 → 上端 70
    const pos = snapFurnitureMove(f, 1000, 220, { xs: [], ys: [75] }, 50, 30);
    expect(furnitureAabb({ ...f, ...pos }).y).toBeCloseTo(75);
  });

  it('リサイズは反対側の辺を固定する', () => {
    const f = fur('sofa', 0, 0); // w1800 d850
    const r = resizeFurniture(f, 'e', { x: 1100, y: 0 }, 10);
    expect(r.w).toBe(2000);
    expect(r.x - r.w / 2).toBeCloseTo(-900);
  });

  it('回転した家具のリサイズ', () => {
    const f = fur('sofa', 0, 0, 90); // 幅方向が下向き
    const r = resizeFurniture(f, 'e', { x: 0, y: 1100 }, 10);
    expect(r.w).toBe(2000);
    expect(r.y).toBeCloseTo(100);
    expect(r.x).toBeCloseTo(0);
  });

  it('回転ハンドルの角度（上 = 0°、右 = 90°）', () => {
    expect(angleFromPointer({ x: 0, y: 0 }, { x: 0, y: -100 }, 15)).toBe(0);
    expect(angleFromPointer({ x: 0, y: 0 }, { x: 100, y: 0 }, 15)).toBe(90);
    expect(angleFromPointer({ x: 0, y: 0 }, { x: 100, y: 95 }, 15)).toBe(135);
  });
});
