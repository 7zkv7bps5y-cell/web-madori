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

/** 共有リンク（閲覧専用）。クラウドに保存した間取りごとに 1 つ */
export interface ShareInfo {
  floorplanId: string;
  /** 64 文字のランダムな識別子（サーバーが生成） */
  token: string;
  createdAt: string;
}

/** 共有リンクで開いた間取り（最新の保存内容） */
export interface SharedFloorplan {
  name: string;
  project: Project;
  updatedAt: string;
}

export const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/;
export const SHARE_NOT_FOUND = 'この共有リンクは停止されたか、存在しません。共有した人に新しいリンクを確認してください。';

export interface CloudUser {
  id: string;
  email: string | null;
}

export type CloudErrorCode = 'quota_exceeded' | 'not_signed_in' | 'not_found' | 'conflict' | 'invalid_data' | 'network' | 'unknown';

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
  /** メールアドレスにログイン用リンク（と 6 桁のコード）を送る */
  signInWithEmail(email: string, redirectTo: string): Promise<void>;
  /**
   * メールに書かれた 6 桁のコードでログインする。
   * リンクは「申し込んだのと同じブラウザ」で開く必要があるため、別の端末でメールを見る場合はこちらを使う
   */
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (user: CloudUser | null) => void): () => void;
  status(): Promise<CloudStatus>;
  list(): Promise<CloudItem[]>;
  /** 読み込み（どの時点のデータかを知るため、一覧項目も返す） */
  load(id: string): Promise<{ project: Project; item: CloudItem }>;
  /** 新規保存（件数を 1 つ使う） */
  create(name: string, project: Project): Promise<CloudItem>;
  /**
   * 上書き保存（件数は使わない）。
   * expectedUpdatedAt を渡すと、その後にほかの端末で更新されていた場合は上書きせず conflict エラーにする
   */
  overwrite(id: string, name: string, project: Project, expectedUpdatedAt?: string): Promise<CloudItem>;
  /** 複製（新規保存と同じく件数を 1 つ使う） */
  duplicate(id: string): Promise<CloudItem>;
  remove(id: string): Promise<void>;

  // ---- 共有リンク（閲覧専用）----
  /** 自分が発行している共有リンクの一覧 */
  listShares(): Promise<ShareInfo[]>;
  /** 共有リンクを発行（すでにあれば新しい識別子で作り直し、古いリンクは無効になる） */
  issueShare(floorplanId: string): Promise<ShareInfo>;
  /** 共有を停止（リンクは無効になる） */
  revokeShare(floorplanId: string): Promise<void>;
  /** 共有リンクの間取りを読む（ログイン不要・閲覧のみ） */
  getShared(token: string): Promise<SharedFloorplan>;
}

export const CONFLICT_MESSAGE =
  'この間取りは、ほかの端末（またはブラウザ）で後から更新されています。上書きすると、そちらの変更は失われます。';

export const QUOTA_MESSAGE =
  'クラウドの保存枠がいっぱいです。保存済みの間取りを削除するか、既存の間取りに上書き保存してください（編集中の内容は消えません）。';
