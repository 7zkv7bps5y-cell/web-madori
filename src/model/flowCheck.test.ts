import { describe, expect, it } from 'vitest';
import { applyFlowFix, checkFlow, doorSwingPolygon, frontZone, polygonDistance } from './flowCheck';
import { createFurniture, createOpening, createProject, createRoom } from './project';
import { TEMPLATES } from './templates';
import type { Project } from './types';

function setup(): Project {
  const p = createProject();
  const fl = p.settings.activeFloorId;
  const room = createRoom('bedroom', { x: 0, y: 0, w: 3640, h: 3640 }, fl);
  return { ...p, rooms: [room] };
}
const add = (p: Project, type: string, x: number, y: number, rotation = 0) => {
  const f = { ...createFurniture(type, { x, y }, p.settings.activeFloorId), rotation };
  p.furniture.push(f);
  return f;
};

describe('ドアの開閉範囲', () => {
  it('扇形は吊元・開く向きに応じて部屋の内側／外側に描かれる', () => {
    const p = setup();
    const o = createOpening('door', { roomId: p.rooms[0].id, side: 'top', offset: 100, width: 800 }, p.settings.activeFloorId);
    const inside = doorSwingPolygon(o, p.rooms[0]);
    expect(inside[0]).toEqual({ x: 100, y: 0 });
    expect(Math.max(...inside.map((q) => q.y))).toBeCloseTo(800);
    const outside = doorSwingPolygon({ ...o, swing: 'out' }, p.rooms[0]);
    expect(Math.min(...outside.map((q) => q.y))).toBeCloseTo(-800);
  });

  it('開閉範囲にかかる家具を検出し、開き方の変更で解決できれば提案する', () => {
    const p = setup();
    const o = createOpening('door', { roomId: p.rooms[0].id, side: 'top', offset: 100, width: 800 }, p.settings.activeFloorId);
    p.openings.push(o);
    const shelf = add(p, 'shelf', 500, 400); // 扉の内側の範囲
    const issues = checkFlow(p).filter((i) => i.kind === 'door');
    expect(issues).toHaveLength(1);
    expect(issues[0].furnitureIds).toEqual([shelf.id]);
    expect(issues[0].fixes.map((f) => f.kind)).toContain('flipSwing');
    // 提案を適用すると解消する
    const fixed = applyFlowFix(p, issues[0].fixes[0]);
    expect(checkFlow(fixed).filter((i) => i.kind === 'door')).toHaveLength(0);
  });

  it('開閉範囲の外の家具は問題なし', () => {
    const p = setup();
    p.openings.push(createOpening('door', { roomId: p.rooms[0].id, side: 'top', offset: 100, width: 800 }, p.settings.activeFloorId));
    add(p, 'shelf', 2500, 2500);
    expect(checkFlow(p).filter((i) => i.kind === 'door')).toHaveLength(0);
  });
});

describe('扉・引き出しの前の空き', () => {
  it('正面のゾーンは回転に合わせて向きが変わる', () => {
    const f = { ...createFurniture('wardrobe', { x: 0, y: 0 }, 'f'), rotation: 0 };
    expect(Math.max(...frontZone(f)!.map((q) => q.y))).toBeCloseTo(300 + 600);
    const r = frontZone({ ...f, rotation: 90 })!;
    expect(Math.min(...r.map((q) => q.x))).toBeCloseTo(-900);
  });

  it('正面を家具がふさぐと警告、背面側は問題なし', () => {
    const p = setup();
    const w = add(p, 'wardrobe', 1500, 400); // 正面は +y 側（y 700〜1300）
    const bed = add(p, 'bed-single', 1500, 1900);
    const issues = checkFlow(p).filter((i) => i.kind === 'front');
    expect(issues).toHaveLength(1);
    expect(issues[0].furnitureIds).toEqual([w.id, bed.id]);
  });

  it('正面が壁に向いていると警告', () => {
    const p = setup();
    add(p, 'fridge', 1500, 3000); // 正面（+y）が下の壁
    expect(checkFlow(p).some((i) => i.kind === 'front' && i.message.includes('壁'))).toBe(true);
  });
});

describe('通路幅', () => {
  it('30〜60cm のすき間は目安として表示する', () => {
    const p = setup();
    add(p, 'bed-single', 1000, 1500); // x 515〜1485
    add(p, 'sofa', 2800, 1500, 90); // 回転 → x 2375〜3225
    const gaps = checkFlow(p).filter((i) => i.kind === 'passage' && i.furnitureIds.length === 2);
    expect(gaps).toHaveLength(0); // 89cm あるので OK
    const p2 = setup();
    add(p2, 'bed-single', 1000, 1500);
    add(p2, 'sofa', 2400, 1500, 90); // x 1975〜 → 49cm
    const g2 = checkFlow(p2).filter((i) => i.kind === 'passage' && i.furnitureIds.length === 2);
    expect(g2).toHaveLength(1);
    expect(g2[0].severity).toBe('info');
    expect(g2[0].shape.kind === 'gap' && Math.round(g2[0].shape.distance)).toBe(490);
  });

  it('ローテーブルなどは対象外', () => {
    const p = setup();
    add(p, 'sofa', 1800, 1000);
    add(p, 'table', 1800, 1800);
    expect(checkFlow(p).filter((i) => i.kind === 'passage' && i.furnitureIds.length === 2)).toHaveLength(0);
  });

  it('家具と壁の間の狭いすき間', () => {
    const p = setup();
    add(p, 'bed-single', 50 + 450 + 485, 1500); // 左の壁面(50)から 45cm
    const g = checkFlow(p).filter((i) => i.id.startsWith('wallgap'));
    expect(g).toHaveLength(1);
    expect(g[0].message).toContain('45cm');
  });

  it('凸多角形の距離', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = a.map((q) => ({ x: q.x + 15, y: q.y + 5 }));
    expect(polygonDistance(a, b).distance).toBeCloseTo(5);
  });
});

describe('テンプレート', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s は警告（要確認）がない', (_, t) => {
    const warnings = checkFlow(t.create()).filter((i) => i.severity === 'warning');
    expect(warnings.map((w) => w.message)).toEqual([]);
  });
});
