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
    expect((await b.load(items[0].id)).project.projectName).toBe('上書き後');
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
    const { project: loaded } = await b.load(item.id);
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

import { resetAccountForTesting, useAccount } from '../store/account';

/** 2 つの端末が同じサーバーを共有している状態（模擬） */
function twoDevices() {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  let tick = Date.parse('2026-11-23T00:00:00Z');
  const now = () => new Date((tick += 1000));
  return [new MockBackend({ storage, now }), new MockBackend({ storage, now })] as const;
}

describe('複数端末・ログイン', () => {
  it('別の端末から同じデータを開いて再編集できる', async () => {
    const [pc, phone] = twoDevices();
    await pc.signInWithEmail('a@example.com');
    const saved = await pc.create('家', tpl());
    await phone.signInWithEmail('a@example.com');
    expect((await phone.list()).map((i) => i.id)).toEqual([saved.id]);
    const { project, item } = await phone.load(saved.id);
    await phone.overwrite(saved.id, '家', { ...project, projectName: 'スマホで編集' }, item.updatedAt);
    expect((await pc.load(saved.id)).project.projectName).toBe('スマホで編集');
  });

  it('読み込んだ後にほかの端末で更新されていたら上書きしない（conflict）。確認後の強制上書きは可能', async () => {
    const [pc, phone] = twoDevices();
    await pc.signInWithEmail('a@example.com');
    const saved = await pc.create('家', tpl());
    const pcLoaded = await pc.load(saved.id);
    await phone.overwrite(saved.id, '家', { ...tpl(), projectName: 'スマホの変更' }); // 後から更新
    await expect(pc.overwrite(saved.id, '家', { ...tpl(), projectName: 'PCの変更' }, pcLoaded.item.updatedAt)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await pc.load(saved.id)).project.projectName).toBe('スマホの変更');
    await pc.overwrite(saved.id, '家', { ...tpl(), projectName: 'PCの変更' }); // 確認後
    expect((await phone.load(saved.id)).project.projectName).toBe('PCの変更');
  });

  it('メールの 6 桁コードでログインできる（模擬）。形式が違えば拒否', async () => {
    const b = new MockBackend();
    await expect(b.verifyEmailCode('a@example.com', '12ab')).rejects.toMatchObject({ code: 'not_signed_in' });
    await b.verifyEmailCode('a@example.com', '123456');
    expect((await b.getUser())?.email).toBe('a@example.com');
  });
});

describe('アカウント状態（画面側）', () => {
  const setup = async () => {
    resetAccountForTesting();
    const b = new MockBackend();
    await b.signInWithEmail('a@example.com');
    useAccount.setState({ backend: b, ready: true, user: await b.getUser(), link: null, conflict: null, error: null });
    await useAccount.getState().refresh();
    return b;
  };

  it('保存枠がいっぱいで失敗しても、編集中のデータは変わらずエラーを表示する', async () => {
    await setup();
    const acc = useAccount.getState();
    for (const n of ['A', 'B', 'C']) await acc.saveNew(n, tpl());
    const p = tpl();
    const before = JSON.stringify(p);
    expect(await useAccount.getState().saveNew('D', p)).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
    expect(useAccount.getState().error).toContain('保存枠がいっぱい');
    expect(useAccount.getState().status?.used).toBe(3);
  });

  it('結びついた間取りへの上書きは、ほかで更新されていたら確認待ち（conflict）になる', async () => {
    const b = await setup();
    const acc = useAccount.getState();
    const p = tpl();
    const item = (await acc.saveNew('家', p))!;
    expect(useAccount.getState().link).toMatchObject({ cloudId: item.id, updatedAt: item.updatedAt });
    await new Promise((r) => setTimeout(r, 5));
    await b.overwrite(item.id, '家', { ...p, projectName: '別の端末' }); // ほかの端末での更新
    expect(await useAccount.getState().overwrite(item.id, '家', p)).toBeNull();
    expect(useAccount.getState().conflict).toEqual({ id: item.id, name: '家' });
    expect(useAccount.getState().error).toBeNull();
    expect(await useAccount.getState().overwrite(item.id, '家', p, true)).not.toBeNull();
    expect(useAccount.getState().conflict).toBeNull();
  });
});
