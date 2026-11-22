/**
 * テスト専用のクラウド保存（模擬）。本番ビルドには含まれない（config.ts の cloudMode 参照）。
 * データベース側（supabase/migrations）と同じ規則で動く:
 * - 保存上限は同時に保持できる件数。新規作成・複製だけが数え、上書きは数えない
 * - 自分のデータだけを扱える
 * - プランは利用者が変更できない（テストからは setPlanForTesting で切り替える）
 */
import { canCreateCloudSave, planConfig, type PlanId } from '../billing/plans';
import { parseProject } from '../model/project';
import type { Project } from '../model/types';
import { toCloudJson } from './supabaseBackend';
import { CloudError, QUOTA_MESSAGE, type CloudBackend, type CloudItem, type CloudUser } from './types';

interface Row extends CloudItem {
  userId: string;
  data: unknown;
}

interface Db {
  rows: Row[];
  plans: Record<string, PlanId>;
  session: CloudUser | null;
}

export interface MockOptions {
  /** 永続化先（e2e では localStorage）。省略時はメモリのみ */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => Date;
}

const KEY = 'web-madori:dev-mock-cloud';
let seq = 0;

export class MockBackend implements CloudBackend {
  readonly kind = 'mock' as const;
  private db: Db;
  private listeners = new Set<(u: CloudUser | null) => void>();

  constructor(private opts: MockOptions = {}) {
    const raw = opts.storage?.getItem(KEY);
    this.db = raw ? (JSON.parse(raw) as Db) : { rows: [], plans: {}, session: null };
  }

  private now() {
    return (this.opts.now?.() ?? new Date()).toISOString();
  }
  private save() {
    this.opts.storage?.setItem(KEY, JSON.stringify(this.db));
  }
  private me(): CloudUser {
    if (!this.db.session) throw new CloudError('not_signed_in', 'ログインしてください。');
    return this.db.session;
  }
  private mine() {
    const me = this.me();
    return this.db.rows.filter((r) => r.userId === me.id);
  }
  private find(id: string) {
    const row = this.mine().find((r) => r.id === id);
    if (!row) throw new CloudError('not_found', '保存データが見つかりません（削除された可能性があります）。');
    return row;
  }
  private limit() {
    return planConfig(this.db.plans[this.me().id] ?? 'free').cloudLimit;
  }
  private insert(name: string, data: unknown): CloudItem {
    const me = this.me();
    if (!canCreateCloudSave(this.mine().length, this.limit())) throw new CloudError('quota_exceeded', QUOTA_MESSAGE);
    const t = this.now();
    const row: Row = { id: `mock-${Date.now().toString(36)}-${++seq}`, userId: me.id, name, data, createdAt: t, updatedAt: t };
    this.db.rows.push(row);
    this.save();
    return pick(row);
  }

  /** テスト専用: プランの切り替え（本番の利用者にはこの手段はない） */
  setPlanForTesting(userId: string, plan: PlanId) {
    this.db.plans[userId] = plan;
    this.save();
  }

  /** テスト専用: 作成日時を過去にずらす（「月が変わっても回復しない」の確認用） */
  ageAllForTesting(days: number) {
    for (const r of this.db.rows) r.createdAt = new Date(Date.parse(r.createdAt) - days * 86400_000).toISOString();
    this.save();
  }

  async getUser() {
    return this.db.session;
  }
  async signInWithEmail(email: string) {
    this.db.session = { id: `mock-user:${email.trim().toLowerCase()}`, email: email.trim() };
    this.save();
    for (const l of this.listeners) l(this.db.session);
  }
  async signOut() {
    this.db.session = null;
    this.save();
    for (const l of this.listeners) l(null);
  }
  onAuthChange(cb: (u: CloudUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async status() {
    const plan = planConfig(this.db.plans[this.me().id] ?? 'free');
    return { planId: plan.id, cloudLimit: plan.cloudLimit, used: this.mine().length, showAds: plan.showAds };
  }
  async list() {
    return this.mine()
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(pick);
  }
  async load(id: string): Promise<Project> {
    const r = parseProject(JSON.stringify(this.find(id).data));
    if (!r.ok) throw new CloudError('invalid_data', r.error);
    return r.project;
  }
  async create(name: string, project: Project) {
    return this.insert(name, toCloudJson(project));
  }
  async overwrite(id: string, name: string, project: Project) {
    const row = this.find(id);
    row.name = name;
    row.data = toCloudJson(project);
    row.updatedAt = this.now();
    this.save();
    return pick(row);
  }
  async duplicate(id: string) {
    const src = this.find(id);
    return this.insert(`${src.name}のコピー`.slice(0, 200), JSON.parse(JSON.stringify(src.data)));
  }
  async remove(id: string) {
    const row = this.find(id);
    this.db.rows = this.db.rows.filter((r) => r !== row);
    this.save();
  }
}

function pick(r: Row): CloudItem {
  return { id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
