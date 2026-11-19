import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../model/templates';
import { addPlan } from '../model/project';
import { decodeShare, encodeShare, shareTokenFromHash } from './share';

describe('URL 共有', () => {
  it('圧縮して URL に入れ、同じ間取りに戻せる（複数階・複数案）', async () => {
    const p = addPlan(TEMPLATES.find((t) => t.id === '4ldk-2f')!.create());
    const token = await encodeShare(p);
    expect(token[0]).toBe('z');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const r = await decodeShare(token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.plans).toHaveLength(2);
    expect(r.project.rooms).toEqual(p.rooms);
    expect(r.project.furniture).toEqual(p.furniture);
  });
  it('一般的な間取りは数 KB の URL に収まる', async () => {
    const token = await encodeShare(TEMPLATES[2].create());
    expect(token.length).toBeLessThan(8000);
  });
  it('壊れたデータ・不正な形式を拒否する', async () => {
    expect((await decodeShare('zAAAA')).ok).toBe(false);
    expect((await decodeShare('x123')).ok).toBe(false);
    expect((await decodeShare('j' + btoa('{"a":1}'))).ok).toBe(false);
  });
  it('ハッシュから取り出す', () => {
    expect(shareTokenFromHash('#p=zAb-_9')).toBe('zAb-_9');
    expect(shareTokenFromHash('#other')).toBeNull();
  });
});
