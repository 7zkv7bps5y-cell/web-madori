import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../model/templates';
import { shareLinkUrl } from '../store/account';
import { MockBackend } from './mockBackend';
import { SHARE_TOKEN_RE } from './types';

function sharedStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
}

describe('共有リンク（模擬: データベースと同じ規則）', () => {
  it('発行したトークンは 64 桁の乱数で、ログインなしで閲覧できる', async () => {
    const storage = sharedStorage();
    const a = new MockBackend({ storage });
    await a.signInWithEmail('a@example.com');
    const item = await a.create('A邸', TEMPLATES[0].create());
    const share = await a.issueShare(item.id);
    expect(share.token).toMatch(SHARE_TOKEN_RE);
    expect(await a.listShares()).toHaveLength(1);
    const guest = new MockBackend({ storage });
    await guest.signOut();
    const got = await guest.getShared(share.token);
    expect(got.name).toBe('A邸');
    expect(got.project.rooms.length).toBeGreaterThan(0);
    expect(shareLinkUrl(share.token, 'https://example.com')).toBe(`https://example.com/editor/?share=${share.token}`);
  });

  it('上書き保存すると共有先にも最新の内容が出る', async () => {
    const storage = sharedStorage();
    const a = new MockBackend({ storage });
    await a.signInWithEmail('a@example.com');
    const item = await a.create('A邸', TEMPLATES[0].create());
    const { token } = await a.issueShare(item.id);
    await a.overwrite(item.id, 'A邸', { ...TEMPLATES[0].create(), projectName: '変更後' });
    expect((await a.getShared(token)).project.projectName).toBe('変更後');
  });

  it('停止・再発行すると古いリンクは使えない。削除しても使えない', async () => {
    const a = new MockBackend({ storage: sharedStorage() });
    await a.signInWithEmail('a@example.com');
    const item = await a.create('A邸', TEMPLATES[0].create());
    const first = await a.issueShare(item.id);
    const second = await a.issueShare(item.id);
    expect(second.token).not.toBe(first.token);
    await expect(a.getShared(first.token)).rejects.toMatchObject({ code: 'not_found' });
    expect((await a.getShared(second.token)).name).toBe('A邸');
    await a.revokeShare(item.id);
    await expect(a.getShared(second.token)).rejects.toMatchObject({ code: 'not_found' });
    const third = await a.issueShare(item.id);
    await a.remove(item.id);
    await expect(a.getShared(third.token)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ほかの人の間取りには発行・停止できない。形式の違うトークンは拒否', async () => {
    const storage = sharedStorage();
    const a = new MockBackend({ storage });
    await a.signInWithEmail('a@example.com');
    const item = await a.create('A邸', TEMPLATES[0].create());
    const { token } = await a.issueShare(item.id);
    const b = new MockBackend({ storage });
    await b.signInWithEmail('b@example.com');
    await expect(b.issueShare(item.id)).rejects.toMatchObject({ code: 'not_found' });
    await b.revokeShare(item.id);
    expect((await b.getShared(token)).name).toBe('A邸');
    expect(await b.listShares()).toHaveLength(0);
    await expect(b.getShared('abc')).rejects.toMatchObject({ code: 'not_found' });
    await expect(b.getShared(token.toUpperCase())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('共有を見た人が「自分のデータとして保存」すると、自分の保存枠に独立した複製ができる', async () => {
    const storage = sharedStorage();
    const a = new MockBackend({ storage });
    await a.signInWithEmail('a@example.com');
    const item = await a.create('A邸', TEMPLATES[0].create());
    const { token } = await a.issueShare(item.id);
    const b = new MockBackend({ storage });
    await b.signInWithEmail('b@example.com');
    const got = await b.getShared(token);
    const mine = await b.create('A邸', { ...got.project, projectName: '自分用' });
    await b.overwrite(mine.id, '自分用', { ...got.project, projectName: '自分で変更' });
    expect((await b.status()).used).toBe(1);
    expect((await a.getShared(token)).project.projectName).not.toBe('自分で変更');
  });
});
