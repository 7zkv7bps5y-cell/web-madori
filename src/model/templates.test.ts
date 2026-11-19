import { describe, expect, it } from 'vitest';
import { openingDef } from './catalog';
import { checkFurniture } from './collision';
import { checkFlow } from './flowCheck';
import { computeConnections, computeWalls, edgeLength, rectsOverlap } from './geometry';
import { layoutLabel } from './stats';
import { TEMPLATES } from './templates';
import type { Project } from './types';

const onFloor = (p: Project, floorId: string): Project => ({ ...p, settings: { ...p.settings, activeFloorId: floorId } });

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('テンプレート %s', (_, t) => {
  const p = t.create();
  it('最初に 1 階（最も低い階）を開く', () => {
    const lowest = [...p.floors].sort((a, b) => a.level - b.level)[0];
    expect(p.settings.activeFloorId).toBe(lowest.id);
  });
  describe.each(p.floors.map((f) => [f.name, f] as const))('%s', (_n, floor) => {
    const rooms = p.rooms.filter((r) => r.floorId === floor.id);
    it('部屋同士が重ならない', () => {
      for (const a of rooms) for (const b of rooms) if (a !== b) expect(rectsOverlap(a, b)).toBe(false);
    });
    it('ドア・窓が壁の範囲に収まる', () => {
      for (const o of p.openings.filter((x) => x.floorId === floor.id)) {
        const room = rooms.find((r) => r.id === o.roomId)!;
        expect(room).toBeDefined();
        expect(o.offset).toBeGreaterThanOrEqual(0);
        expect(o.offset + o.width).toBeLessThanOrEqual(edgeLength(room, o.side));
        expect(o.width).toBeGreaterThanOrEqual(openingDef(o.type).minWidth);
      }
    });
    it('すべての部屋がつながっている', () => {
      const conns = computeConnections(computeWalls(rooms, floor.id));
      const seen = new Set([rooms[0].id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of conns) {
          if (seen.has(c.a) !== seen.has(c.b)) {
            seen.add(c.a);
            seen.add(c.b);
            grew = true;
          }
        }
      }
      expect(seen.size).toBe(rooms.length);
    });
    it('家具の干渉・生活動線の要確認がない', () => {
      const v = onFloor(p, floor.id);
      expect(Array.from(checkFurniture(v).entries())).toEqual([]);
      expect(checkFlow(v).filter((i) => i.severity === 'warning').map((i) => i.message)).toEqual([]);
    });
  });
  it('間取りタイプが名前と一致する', () => {
    expect(t.name.startsWith(layoutLabel(p.rooms.map((r) => r.type)))).toBe(true);
  });
  if (p.floors.length > 1) {
    it('階段の位置が上下の階で揃っている', () => {
      const stairs = p.floors.map((f) => p.rooms.find((r) => r.floorId === f.id && r.type === 'stairs'));
      for (const s of stairs) expect(s).toBeDefined();
      for (const s of stairs.slice(1)) expect([s!.x, s!.y, s!.w, s!.h]).toEqual([stairs[0]!.x, stairs[0]!.y, stairs[0]!.w, stairs[0]!.h]);
    });
  }
});
