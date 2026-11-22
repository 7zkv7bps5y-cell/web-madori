import { describe, expect, it } from 'vitest';
import { parseProject } from '../model/project';
import { TEMPLATES } from '../model/templates';
import { cloudMode } from './config';
import { MockBackend } from './mockBackend';
import { mapSupabaseError, SupabaseBackend, toCloudJson } from './supabaseBackend';
import { CloudError } from './types';

const tpl = () => TEMPLATES[0].create();

async function signedIn(email = 'a@example.com', now?: () => Date) {
  const b = new MockBackend({ now });
  await b.signInWithEmail(email);
  return b;
}

describe('クラウド保存（模擬: データベースと同じ規則）', () => {
  it('無料は 3 件まで。4 件目は保存できない', async () => {
    const b = await signedIn();
    for (const n of ['A', 'B', 'C']) await b.create(n, tpl());
    await expect(b.create('D', tpl())).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect(await b.status()).toMatchObject({ planId: 'free', used: 3, cloudLimit: 3 });
  });

  it('上限でも上書きはできる（件数は増えない）', async () => {
    const b = await signedIn();
    const items = [];
    for (const n of ['A', 'B', 'C']) items.push(await b.create(n, tpl()));
    const edited = { ...tpl(), projectName: '上書き後' };
    await b.overwrite(items[0].id, 'A', edited);
    expect((await b.load(items[0].id)).projectName).toBe('上書き後');
    expect((await b.status()).used).toBe(3);
  });

  it('削除すると新規保存できる。複製も 1 件使う', async () => {
    const b = await signedIn();
    const items = [];
    for (const n of ['A', 'B', 'C']) items.push(await b.create(n, tpl()));
    await expect(b.duplicate(items[0].id)).rejects.toMatchObject({ code: 'quota_exceeded' });
    await b.remove(items[1].id);
    const dup = await b.duplicate(items[0].id);
    expect(dup.name).toBe('Aのコピー');
    await expect(b.create('E', tpl())).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('月が変わっても保存枠は回復しない', async () => {
    let t = new Date('2026-11-10T00:00:00Z');
    const b = await signedIn('a@example.com', () => t);
    for (const n of ['A', 'B', 'C']) await b.create(n, tpl());
    t = new Date('2026-12-05T00:00:00Z');
    b.ageAllForTesting(60);
    await expect(b.create('D', tpl())).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect((await b.list()).length).toBe(3);
  });

  it('別のアカウントのデータは見えず、開けない・消せない', async () => {
    const b = await signedIn('a@example.com');
    const a1 = await b.create('Aの間取り', tpl());
    await b.signInWithEmail('b@example.com');
    expect(await b.list()).toEqual([]);
    await expect(b.load(a1.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(b.remove(a1.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(b.overwrite(a1.id, 'x', tpl())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('有料プランは 30 件。解約後はデータが残り、新規だけ不可', async () => {
    const b = await signedIn('p@example.com');
    const me = (await b.getUser())!;
    b.setPlanForTesting(me.id, 'premium');
    for (let i = 0; i < 30; i++) await b.create(`P${i}`, tpl());
    await expect(b.create('P30', tpl())).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect(await b.status()).toMatchObject({ planId: 'premium', showAds: false });
    b.setPlanForTesting(me.id, 'free');
    expect((await b.list()).length).toBe(30);
    const first = (await b.list())[0];
    await b.overwrite(first.id, first.name, tpl());
    await expect(b.create('X', tpl())).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('未ログインでは使えない', async () => {
    const b = new MockBackend();
    await expect(b.list()).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  it('保存した間取りは .floorplan と同じ形式で、すべての階・案が復元される', async () => {
    const b = await signedIn();
    const p = TEMPLATES.find((t) => t.id === '4ldk-2f')!.create();
    const item = await b.create('2階建て', p);
    const loaded = await b.load(item.id);
    expect(loaded.rooms).toEqual(p.rooms);
    expect(loaded.floors.length).toBe(2);
  });
});

describe('Supabase 連携', () => {
  it('保存データは .floorplan の形式（派生データは除く）', () => {
    const json = toCloudJson(tpl()) as { format: string; plans: { derived?: unknown }[] };
    expect(json.format).toBe('web-madori');
    expect(json.plans.every((p) => p.derived === undefined)).toBe(true);
    expect(parseProject(JSON.stringify(json)).ok).toBe(true);
  });

  it('データベースのエラーを分かりやすいエラーに変換する', () => {
    expect(mapSupabaseError({ message: 'cloud_quota_exceeded' }).code).toBe('quota_exceeded');
    expect(mapSupabaseError({ code: 'PGRST116', message: 'no rows' }).code).toBe('not_found');
    expect(mapSupabaseError({ code: '42501', message: 'new row violates row-level security policy' }).code).toBe('not_signed_in');
    expect(mapSupabaseError({ message: 'TypeError: Failed to fetch' }).code).toBe('network');
    expect(mapSupabaseError({ message: 'violates check constraint "floorplans_data_size"' }).code).toBe('invalid_data');
  });

  it('上限エラーのとき、編集中のデータを変えずにエラーを返す', async () => {
    const fake = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'cloud_quota_exceeded', code: 'P0001' } }) }) }),
      }),
    };
    const backend = new SupabaseBackend(fake as never);
    const p = tpl();
    const before = JSON.stringify(p);
    await expect(backend.create('x', p)).rejects.toBeInstanceOf(CloudError);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('設定がなければ「未設定」（動いているように見せない）', () => {
    expect(cloudMode()).toBe('unconfigured');
  });
});
