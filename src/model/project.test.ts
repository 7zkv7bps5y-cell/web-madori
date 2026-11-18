import { describe, expect, it } from 'vitest';
import { createProject, parseProject, serializeProject } from './project';
import { TEMPLATES } from './templates';
import { sizeFromTatami, tatamiFromSize } from './units';

describe('保存データ', () => {
  it('シリアライズ → 読み込みで同じ状態に復元できる', () => {
    const p = TEMPLATES[0].create();
    const text = serializeProject(p);
    const r = parseProject(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.rooms).toEqual(p.rooms);
    expect(r.project.openings).toEqual(p.openings);
    expect(r.project.settings).toEqual(p.settings);
    expect(r.project.projectName).toBe(p.projectName);
  });

  it('派生データ（壁・接続）を出力する', () => {
    const p = TEMPLATES[0].create();
    const json = JSON.parse(serializeProject(p));
    expect(json.plans[0].derived[0].walls.length).toBeGreaterThan(0);
    expect(json.plans[0].derived[0].connections.length).toBeGreaterThan(0);
  });

  it('不正な JSON・形式・巨大データを拒否する', () => {
    expect(parseProject('not json').ok).toBe(false);
    expect(parseProject('{"format":"other"}').ok).toBe(false);
    expect(parseProject('x'.repeat(5_000_001)).ok).toBe(false);
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.plans[0].rooms = [{ id: 'r', floorId: p.floors[0].id, type: 'room', name: 'a', x: 0, y: 0, w: -5, h: 10 }];
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false);
  });

  it('存在しない部屋を参照するドアは取り除く', () => {
    const p = TEMPLATES[0].create();
    const json = JSON.parse(serializeProject(p));
    json.plans[0].openings[0].roomId = 'missing';
    const r = parseProject(JSON.stringify(json));
    expect(r.ok && r.project.openings.length).toBe(p.openings.length - 1);
  });

  it('サンプル間取りの部屋同士は重ならない', async () => {
    const { rectsOverlap } = await import('./geometry');
    const p = TEMPLATES[0].create();
    for (const a of p.rooms) for (const b of p.rooms) if (a !== b) expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe('畳数の換算', () => {
  it.each([4.5, 6, 8, 10, 12, 20])('%s畳に近い寸法をグリッド単位で求める', (t) => {
    const { w, h } = sizeFromTatami(t, 455);
    expect(w % 455).toBe(0);
    expect(h % 455).toBe(0);
    expect(Math.abs(tatamiFromSize(w, h) - t) / t).toBeLessThan(0.12);
  });
});

import { activeContent, addPlan, createFurniture, deletePlan, materializePlan, switchPlan } from './project';
import { layoutLabel } from './stats';

describe('複数の間取り案', () => {
  it('案の複製は ID を振り直し、元の案に影響しない', () => {
    const p0 = TEMPLATES[0].create();
    const p1 = addPlan(p0, activeContent(p0));
    expect(p1.plans.map((e) => e.name)).toEqual(['A案', 'B案']);
    expect(p1.activePlanId).toBe(p1.plans[1].id);
    expect(p1.rooms).toHaveLength(p0.rooms.length);
    expect(p1.rooms[0].id).not.toBe(p0.rooms[0].id);
    // B案を編集してから A案へ切り替えると、A案は元のまま
    const edited = { ...p1, rooms: p1.rooms.slice(1) };
    const backToA = switchPlan(edited, p1.plans[0].id);
    expect(backToA.rooms).toEqual(p0.rooms);
    // B案の変更は保持されている
    expect(materializePlan(backToA, p1.plans[1].id).rooms).toHaveLength(p0.rooms.length - 1);
  });

  it('全案を保存・復元できる（家具を含む）', () => {
    let p = TEMPLATES[0].create();
    p = { ...p, furniture: [createFurniture('sofa', { x: 1000, y: 1000 }, p.settings.activeFloorId)] };
    p = addPlan(p);
    const r = parseProject(serializeProject(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.plans).toHaveLength(2);
    expect(r.project.activePlanId).toBe(p.activePlanId);
    expect(r.project.rooms).toHaveLength(0);
    const a = materializePlan(r.project, p.plans[0].id);
    expect(a.rooms).toEqual(p.plans[0].content!.rooms);
    expect(a.furniture[0]).toMatchObject({ type: 'sofa', x: 1000, y: 1000, productId: null });
  });

  it('最後の 1 案は削除できない。編集中の案を削除すると別の案に切り替わる', () => {
    const p = addPlan(TEMPLATES[0].create());
    const d = deletePlan(p, p.activePlanId);
    expect(d.plans).toHaveLength(1);
    expect(d.rooms.length).toBeGreaterThan(0);
    expect(deletePlan(d, d.activePlanId).plans).toHaveLength(1);
  });

  it('旧形式（version 1）のファイルを読み込める', () => {
    const p = TEMPLATES[0].create();
    const v1 = {
      format: 'web-madori',
      version: 1,
      projectId: p.projectId,
      projectName: p.projectName,
      floors: p.floors,
      rooms: p.rooms,
      openings: p.openings,
      furniture: [],
      settings: { ...p.settings, furnitureGrid: undefined },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
    const r = parseProject(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.rooms).toEqual(p.rooms);
    expect(r.project.plans).toHaveLength(1);
    expect(r.project.settings.furnitureGrid).toBe(50);
  });
});

describe('間取りタイプ表記', () => {
  it.each([
    [['ldk', 'bedroom', 'washitsu', 'bath'], '2LDK'],
    [['dk', 'room'], '1DK'],
    [['kitchen', 'room'], '1K'],
    [['living', 'dining', 'kitchen', 'room', 'kids', 'bedroom'], '3LDK'],
  ] as const)('%j → %s', (types, label) => {
    expect(layoutLabel([...types])).toBe(label);
  });
});
