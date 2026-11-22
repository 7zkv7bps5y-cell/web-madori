import type { SupabaseClient } from '@supabase/supabase-js';
import { planConfig } from '../billing/plans';
import { parseProject, serializeProject } from '../model/project';
import type { Project } from '../model/types';
import { CloudError, QUOTA_MESSAGE, type CloudBackend, type CloudItem, type CloudStatus, type CloudUser } from './types';

const COLUMNS = 'id, name, created_at, updated_at';

interface Row {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const toItem = (r: Row): CloudItem => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });

/** Supabase のエラーを画面向けのエラーに変換する */
export function mapSupabaseError(e: { message?: string; code?: string } | null | undefined): CloudError {
  const msg = e?.message ?? '';
  if (msg.includes('cloud_quota_exceeded')) return new CloudError('quota_exceeded', QUOTA_MESSAGE);
  if (e?.code === 'PGRST116') return new CloudError('not_found', '保存データが見つかりません（削除された可能性があります）。');
  if (e?.code === '42501' || msg.includes('JWT')) return new CloudError('not_signed_in', 'ログインの有効期限が切れました。もう一度ログインしてください。');
  if (msg.includes('floorplans_data_size')) return new CloudError('invalid_data', '間取りデータが大きすぎるため保存できません（5MB まで）。');
  if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network'))
    return new CloudError('network', '通信できませんでした。電波の良い場所でもう一度お試しください（編集中の内容は消えません）。');
  return new CloudError('unknown', `クラウド保存でエラーが発生しました。${msg ? `（${msg}）` : ''}`);
}

/** クラウドに保存する JSON（.floorplan と同じ内容。派生データは除いて軽くする） */
export function toCloudJson(project: Project): unknown {
  const data = JSON.parse(serializeProject(project, false)) as { plans: { derived?: unknown }[] };
  for (const pl of data.plans) delete pl.derived;
  return data;
}

export async function createSupabaseBackend(url: string, anonKey: string): Promise<CloudBackend> {
  const { createClient } = await import('@supabase/supabase-js');
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return new SupabaseBackend(client);
}

export class SupabaseBackend implements CloudBackend {
  readonly kind = 'supabase' as const;
  constructor(private client: SupabaseClient) {}

  async getUser(): Promise<CloudUser | null> {
    const { data } = await this.client.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? null } : null;
  }

  async signInWithEmail(email: string, redirectTo: string) {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) throw new CloudError('unknown', `ログイン用メールを送れませんでした。（${error.message}）`);
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  onAuthChange(cb: (user: CloudUser | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async status(): Promise<CloudStatus> {
    const { data, error } = await this.client.rpc('my_cloud_status');
    if (error) throw mapSupabaseError(error);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { plan_id: string; cloud_limit: number; used: number; show_ads: boolean }
      | undefined;
    if (!row) throw new CloudError('not_signed_in', 'ログインしてください。');
    const plan = planConfig(row.plan_id);
    return { planId: plan.id, cloudLimit: row.cloud_limit, used: row.used, showAds: row.show_ads };
  }

  async list(): Promise<CloudItem[]> {
    const { data, error } = await this.client.from('floorplans').select(COLUMNS).order('updated_at', { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data as Row[]).map(toItem);
  }

  async load(id: string): Promise<Project> {
    const { data, error } = await this.client.from('floorplans').select('data').eq('id', id).single();
    if (error) throw mapSupabaseError(error);
    // 読み込みはファイルの「開く」と同じ検証を通す（旧形式にも対応）
    const r = parseProject(JSON.stringify((data as { data: unknown }).data));
    if (!r.ok) throw new CloudError('invalid_data', r.error);
    return r.project;
  }

  async create(name: string, project: Project): Promise<CloudItem> {
    const { data, error } = await this.client
      .from('floorplans')
      .insert({ name, data: toCloudJson(project), format_version: 2 })
      .select(COLUMNS)
      .single();
    if (error) throw mapSupabaseError(error);
    return toItem(data as Row);
  }

  async overwrite(id: string, name: string, project: Project): Promise<CloudItem> {
    const { data, error } = await this.client
      .from('floorplans')
      .update({ name, data: toCloudJson(project), format_version: 2 })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw mapSupabaseError(error);
    return toItem(data as Row);
  }

  async duplicate(id: string): Promise<CloudItem> {
    const { data, error } = await this.client.from('floorplans').select('name, data').eq('id', id).single();
    if (error) throw mapSupabaseError(error);
    const src = data as { name: string; data: unknown };
    const { data: created, error: e2 } = await this.client
      .from('floorplans')
      .insert({ name: `${src.name}のコピー`.slice(0, 200), data: src.data, format_version: 2 })
      .select(COLUMNS)
      .single();
    if (e2) throw mapSupabaseError(e2);
    return toItem(created as Row);
  }

  async remove(id: string) {
    const { error } = await this.client.from('floorplans').delete().eq('id', id);
    if (error) throw mapSupabaseError(error);
  }
}
