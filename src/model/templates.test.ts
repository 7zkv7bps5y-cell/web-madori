import { describe, expect, it } from 'vitest';
import { openingDef } from './catalog';
import { checkFurniture } from './collision';
import { computeConnections, computeWalls, edgeLength, rectsOverlap } from './geometry';
import { layoutLabel } from './stats';
import { TEMPLATES } from './templates';

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('テンプレート %s', (_, t) => {
  const p = t.create();
  it('部屋同士が重ならない', () => {
    for (const a of p.rooms) for (const b of p.rooms) if (a !== b) expect(rectsOverlap(a, b)).toBe(false);
  });
  it('ドア・窓が壁の範囲に収まる', () => {
    for (const o of p.openings) {
      const room = p.rooms.find((r) => r.id === o.roomId)!;
      expect(o.offset).toBeGreaterThanOrEqual(0);
      expect(o.offset + o.width).toBeLessThanOrEqual(edgeLength(room, o.side));
      expect(o.width).toBeGreaterThanOrEqual(openingDef(o.type).minWidth);
    }
  });
  it('すべての部屋がつながっている', () => {
    const conns = computeConnections(computeWalls(p.rooms, p.settings.activeFloorId));
    const seen = new Set([p.rooms[0].id]);
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
    expect(seen.size).toBe(p.rooms.length);
  });
  it('家具の干渉がない', () => {
    expect(Array.from(checkFurniture(p).entries())).toEqual([]);
  });
  it('間取りタイプが名前と一致する', () => {
    expect(t.name.startsWith(layoutLabel(p.rooms.map((r) => r.type)))).toBe(true);
  });
});
