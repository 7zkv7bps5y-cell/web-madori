import type { PlanId } from '../billing/plans';
import type { Project } from '../model/types';

/** クラウドに保存した間取りの一覧項目 */
export interface CloudItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** 自分のプラン・保存件数の上限と使用数 */
export interface CloudStatus {
  planId: PlanId;
  cloudLimit: number;
  used: number;
  showAds: boolean;
}

export interface CloudUser {
  id: string;
  email: string | null;
}

export type CloudErrorCode = 'quota_exceeded' | 'not_signed_in' | 'not_found' | 'invalid_data' | 'network' | 'unknown';

export class CloudError extends Error {
  constructor(
    public code: CloudErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * クラウド保存の窓口。実装は Supabase（本番）と、テスト専用の模擬実装の 2 つ。
 * 保存上限の最終判定はサーバー（データベースのトリガー）で行う。
 */
export interface CloudBackend {
  readonly kind: 'supabase' | 'mock';
  getUser(): Promise<CloudUser | null>;
  /** メールアドレスにログイン用リンクを送る */
  signInWithEmail(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (user: CloudUser | null) => void): () => void;
  status(): Promise<CloudStatus>;
  list(): Promise<CloudItem[]>;
  load(id: string): Promise<Project>;
  /** 新規保存（件数を 1 つ使う） */
  create(name: string, project: Project): Promise<CloudItem>;
  /** 上書き保存（件数は使わない） */
  overwrite(id: string, name: string, project: Project): Promise<CloudItem>;
  /** 複製（新規保存と同じく件数を 1 つ使う） */
  duplicate(id: string): Promise<CloudItem>;
  remove(id: string): Promise<void>;
}

export const QUOTA_MESSAGE =
  'クラウドの保存枠がいっぱいです。保存済みの間取りを削除するか、既存の間取りに上書き保存してください（編集中の内容は消えません）。';
