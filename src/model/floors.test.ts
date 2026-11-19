import { describe, expect, it } from 'vitest';
import { wallKind, wallThicknessOf } from './collision';
import { computeWalls } from './geometry';
import { addFloor, createProject, createRoom, deleteFloor, floorBelow, parseProject, serializeProject } from './project';
import { floorArea, planStats } from './stats';
import { TEMPLATES } from './templates';

describe('階の操作', () => {
  it('上の階を追加すると編集中になり、下の階を参照できる', () => {
    const p0 = createProject();
    const p1 = addFloor(p0);
    expect(p1.floors.map((f) => f.name)).toEqual(['1階', '2階']);
    expect(p1.settings.activeFloorId).toBe(p1.floors[1].id);
    expect(floorBelow(p1)?.id).toBe(p0.floors[0].id);
    expect(floorBelow(p0)).toBeUndefined();
  });

  it('階を削除するとその階の要素も消え、最後の 1 階は残る', () => {
    let p = addFloor(createProject());
    const f2 = p.settings.activeFloorId;
    p = { ...p, rooms: [createRoom('room', { x: 0, y: 0, w: 2730, h: 2730 }, f2)] };
    const d = deleteFloor(p, f2);
    expect(d.floors).toHaveLength(1);
    expect(d.rooms).toHaveLength(0);
    expect(d.settings.activeFloorId).toBe(d.floors[0].id);
    expect(deleteFloor(d, d.floors[0].id).floors).toHaveLength(1);
  });

  it('2 階建ての保存・復元', () => {
    const p = TEMPLATES.find((t) => t.id === '4ldk-2f')!.create();
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.project.floors.length).toBe(2);
    expect(r.ok && r.project.rooms.length).toBe(p.rooms.length);
  });

  it('統計は全階を合計し、バルコニーは床面積に含めない', () => {
    const p = TEMPLATES.find((t) => t.id === '4ldk-2f')!.create();
    const st = planStats(p);
    expect(st.floors).toHaveLength(2);
    expect(st.totalArea).toBeCloseTo(st.floors[0].area + st.floors[1].area);
    const f2 = p.floors[1].id;
    const balcony = p.rooms.find((r) => r.type === 'balcony')!;
    expect(floorArea(p.rooms.filter((r) => r.floorId === f2))).toBeCloseTo(
      p.rooms.filter((r) => r.floorId === f2 && r !== balcony).reduce((s, r) => s + (r.w * r.h) / 1e6, 0),
    );
    expect(st.layout).toBe('4LDK');
  });
});

describe('バルコニーの壁', () => {
  it('外周は手すり、室内との境は外壁の厚さ', () => {
    const p = createProject();
    const f = p.settings.activeFloorId;
    const room = createRoom('bedroom', { x: 0, y: 0, w: 3640, h: 3640 }, f);
    const balcony = createRoom('balcony', { x: 0, y: -910, w: 3640, h: 910 }, f);
    const q = { ...p, rooms: [room, balcony] };
    const walls = computeWalls(q.rooms, f);
    const top = walls.find((w) => w.orientation === 'h' && w.pos === -910)!;
    const between = walls.find((w) => w.orientation === 'h' && w.pos === 0)!;
    expect(wallKind(top, q)).toBe('railing');
    expect(wallThicknessOf(top, q)).toBe(60);
    expect(wallKind(between, q)).toBe('exterior');
    expect(wallThicknessOf(between, q)).toBe(q.settings.exteriorWallThickness);
  });
});
