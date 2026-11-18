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
    expect(json.derived[0].walls.length).toBeGreaterThan(0);
    expect(json.derived[0].connections.length).toBeGreaterThan(0);
  });

  it('不正な JSON・形式・巨大データを拒否する', () => {
    expect(parseProject('not json').ok).toBe(false);
    expect(parseProject('{"format":"other"}').ok).toBe(false);
    expect(parseProject('x'.repeat(5_000_001)).ok).toBe(false);
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.rooms = [{ id: 'r', floorId: p.floors[0].id, type: 'room', name: 'a', x: 0, y: 0, w: -5, h: 10 }];
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false);
  });

  it('存在しない部屋を参照するドアは取り除く', () => {
    const p = TEMPLATES[0].create();
    const json = JSON.parse(serializeProject(p));
    json.openings[0].roomId = 'missing';
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
