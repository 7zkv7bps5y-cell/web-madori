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
import {
  CloudError,
  CONFLICT_MESSAGE,
  QUOTA_MESSAGE,
  SHARE_NOT_FOUND,
  SHARE_TOKEN_RE,
  type CloudBackend,
  type CloudItem,
  type CloudUser,
  type SharedFloorplan,
  type ShareInfo,
} from './types';

interface Row extends CloudItem {
  userId: string;
  data: unknown;
}

interface Db {
  rows: Row[];
  plans: Record<string, PlanId>;
  session: CloudUser | null;
  /** 共有リンク（データベースの floorplan_shares と同じ規則） */
  shares?: { floorplanId: string; userId: string; token: string; createdAt: string }[];
}

/** 64 文字のランダムな識別子（サーバーの生成方法と同じ形式） */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
    this.db = { rows: [], plans: {}, session: null };
    this.reload();
  }

  /** 保存先から読み直す（同じ保存先を共有する別の画面・端末の変更を反映） */
  private reload() {
    const raw = this.opts.storage?.getItem(KEY);
    if (raw) this.db = JSON.parse(raw) as Db;
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
    this.reload();
    this.db.plans[userId] = plan;
    this.save();
  }

  /** テスト専用: 作成日時を過去にずらす（「月が変わっても回復しない」の確認用） */
  ageAllForTesting(days: number) {
    this.reload();
    for (const r of this.db.rows) r.createdAt = new Date(Date.parse(r.createdAt) - days * 86400_000).toISOString();
    this.save();
  }

  async getUser() {
    this.reload();
    return this.db.session;
  }
  async signInWithEmail(email: string) {
    this.reload();
    this.db.session = { id: `mock-user:${email.trim().toLowerCase()}`, email: email.trim() };
    this.save();
    for (const l of this.listeners) l(this.db.session);
  }
  /** 模擬: 6 桁の数字ならログインできる（本物のコード確認は Supabase が行う） */
  async verifyEmailCode(email: string, code: string) {
    if (!/^\d{6}$/.test(code.trim())) throw new CloudError('not_signed_in', 'コードが正しくないか、有効期限が切れています。もう一度メールを送ってください。');
    await this.signInWithEmail(email);
  }

  async signOut() {
    this.reload();
    this.db.session = null;
    this.save();
    for (const l of this.listeners) l(null);
  }
  onAuthChange(cb: (u: CloudUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async status() {
    this.reload();
    const plan = planConfig(this.db.plans[this.me().id] ?? 'free');
    return { planId: plan.id, cloudLimit: plan.cloudLimit, used: this.mine().length, showAds: plan.showAds };
  }
  async list() {
    this.reload();
    return this.mine()
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(pick);
  }
  async load(id: string): Promise<{ project: Project; item: CloudItem }> {
    this.reload();
    const row = this.find(id);
    const r = parseProject(JSON.stringify(row.data));
    if (!r.ok) throw new CloudError('invalid_data', r.error);
    return { project: r.project, item: pick(row) };
  }
  async create(name: string, project: Project) {
    this.reload();
    return this.insert(name, toCloudJson(project));
  }
  async overwrite(id: string, name: string, project: Project, expectedUpdatedAt?: string) {
    this.reload();
    const row = this.find(id);
    if (expectedUpdatedAt && row.updatedAt !== expectedUpdatedAt) throw new CloudError('conflict', CONFLICT_MESSAGE);
    row.name = name;
    row.data = toCloudJson(project);
    // 同じ時刻の連続更新でも区別できるよう、必ず進める
    const t = this.now();
    row.updatedAt = t > row.updatedAt ? t : new Date(Date.parse(row.updatedAt) + 1).toISOString();
    this.save();
    return pick(row);
  }
  async duplicate(id: string) {
    this.reload();
    const src = this.find(id);
    return this.insert(`${src.name}のコピー`.slice(0, 200), JSON.parse(JSON.stringify(src.data)));
  }
  async remove(id: string) {
    this.reload();
    const row = this.find(id);
    this.db.rows = this.db.rows.filter((r) => r !== row);
    // 間取りを消すと共有も消える（データベースの on delete cascade と同じ）
    this.db.shares = (this.db.shares ?? []).filter((s) => s.floorplanId !== row.id);
    this.save();
  }

  async listShares(): Promise<ShareInfo[]> {
    this.reload();
    const me = this.me();
    return (this.db.shares ?? []).filter((s) => s.userId === me.id).map(({ floorplanId, token, createdAt }) => ({ floorplanId, token, createdAt }));
  }
  async issueShare(floorplanId: string): Promise<ShareInfo> {
    this.reload();
    const row = this.find(floorplanId); // 自分の間取りでなければ not_found
    const shares = (this.db.shares ?? []).filter((s) => s.floorplanId !== row.id);
    const share = { floorplanId: row.id, userId: row.userId, token: randomToken(), createdAt: this.now() };
    this.db.shares = [...shares, share];
    this.save();
    return { floorplanId: share.floorplanId, token: share.token, createdAt: share.createdAt };
  }
  async revokeShare(floorplanId: string) {
    this.reload();
    const me = this.me();
    this.db.shares = (this.db.shares ?? []).filter((s) => !(s.floorplanId === floorplanId && s.userId === me.id));
    this.save();
  }
  /** ログイン不要 */
  async getShared(token: string): Promise<SharedFloorplan> {
    this.reload();
    const share = SHARE_TOKEN_RE.test(token) ? (this.db.shares ?? []).find((s) => s.token === token) : undefined;
    const row = share && this.db.rows.find((r) => r.id === share.floorplanId);
    if (!row) throw new CloudError('not_found', SHARE_NOT_FOUND);
    const r = parseProject(JSON.stringify(row.data));
    if (!r.ok) throw new CloudError('invalid_data', r.error);
    return { name: row.name, project: r.project, updatedAt: row.updatedAt };
  }
}

function pick(r: Row): CloudItem {
  return { id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
