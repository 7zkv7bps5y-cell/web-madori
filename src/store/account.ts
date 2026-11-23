/**
 * アカウント・クラウド保存・プランの状態。
 * - クラウド保存に失敗しても、編集中の間取り（project）には一切触れない（エラー表示のみ）
 * - プランの判定はサーバー（my_cloud_status）の値を使う。未ログイン・未設定は無料プラン扱い
 * - 結びついたクラウドの間取りに上書きするときは、読み込み後にほかの端末で更新されていないか確認する
 */
import { create } from 'zustand';
import { planConfig, type PlanConfig } from '../billing/plans';
import { cloudMode, supabaseEnv, type CloudMode } from '../cloud/config';
import { CloudError, type CloudBackend, type CloudItem, type CloudStatus, type CloudUser } from '../cloud/types';
import type { Project } from '../model/types';

export interface CloudLink {
  cloudId: string;
  name: string;
  /** どの間取り（projectId）と結びついているか */
  projectId: string;
  /** 最後に読み込み・保存した時点のクラウド側の更新日時（ほかの端末での更新の検出用） */
  updatedAt?: string;
}

const LINK_KEY = 'web-madori:cloud-link';

function readLink(): CloudLink | null {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    return raw ? (JSON.parse(raw) as CloudLink) : null;
  } catch {
    return null;
  }
}
function writeLink(link: CloudLink | null) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    /* 保存できない環境 */
  }
}

async function createBackend(mode: CloudMode): Promise<CloudBackend | null> {
  if (mode === 'supabase') {
    const env = supabaseEnv()!;
    const { createSupabaseBackend } = await import('../cloud/supabaseBackend');
    return createSupabaseBackend(env.url, env.anonKey);
  }
  // テスト用ビルド（--mode e2e）以外では、この分岐はビルド時に取り除かれる
  if (import.meta.env.MODE === 'e2e' && mode === 'mock') {
    const { MockBackend } = await import('../cloud/mockBackend');
    return new MockBackend({ storage: localStorage });
  }
  return null;
}

/** ログイン用リンクの戻り先 URL に付いたエラー（期限切れ・別のブラウザで開いた等） */
function authErrorFromUrl(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const desc = q.get('error_description') ?? h.get('error_description');
    if (!desc && !q.get('error') && !h.get('error')) return null;
    return `ログインできませんでした。リンクの有効期限が切れたか、申し込んだのと別のブラウザで開いた可能性があります。メールに書かれた 6 桁のコードを入力するか、もう一度メールを送ってください。${desc ? `（${desc}）` : ''}`;
  } catch {
    return null;
  }
}

export interface ConflictState {
  id: string;
  name: string;
}

interface AccountState {
  mode: CloudMode;
  ready: boolean;
  backend: CloudBackend | null;
  user: CloudUser | null;
  status: CloudStatus | null;
  items: CloudItem[];
  busy: string | null;
  error: string | null;
  /** ほかの端末で更新されていたため上書きを止めた間取り（確認待ち） */
  conflict: ConflictState | null;
  link: CloudLink | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  signIn: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  saveNew: (name: string, project: Project) => Promise<CloudItem | null>;
  /** force = true なら、ほかの端末での更新を確認せずに上書き */
  overwrite: (id: string, name: string, project: Project, force?: boolean) => Promise<CloudItem | null>;
  open: (id: string) => Promise<Project | null>;
  duplicate: (id: string) => Promise<CloudItem | null>;
  remove: (id: string) => Promise<boolean>;
  unlink: () => void;
  clearError: () => void;
  clearConflict: () => void;
}

const message = (e: unknown) => (e instanceof CloudError ? e.message : 'クラウド保存でエラーが発生しました。編集中の内容は消えていません。');

// 同時に呼ばれても 1 回だけ実行する（初期化・一覧の読み込み）
let initPromise: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;

export const useAccount = create<AccountState>((set, get) => {
  /** 失敗しても例外を外に出さず、エラー表示にする */
  const run = async <T,>(label: string, fn: (b: CloudBackend) => Promise<T>): Promise<T | null> => {
    const b = get().backend;
    if (!b) return null;
    set({ busy: label, error: null });
    try {
      return await fn(b);
    } catch (e) {
      if (e instanceof CloudError && e.code === 'conflict') return null; // 呼び出し側で確認画面にする
      set({ error: message(e) });
      if (e instanceof CloudError && e.code === 'not_signed_in') set({ user: null, status: null, items: [] });
      return null;
    } finally {
      set({ busy: null });
    }
  };

  const setLink = (item: CloudItem, projectId: string) => {
    const link = { cloudId: item.id, name: item.name, projectId, updatedAt: item.updatedAt };
    writeLink(link);
    set({ link });
  };

  return {
    mode: cloudMode(),
    ready: false,
    backend: null,
    user: null,
    status: null,
    items: [],
    busy: null,
    error: null,
    conflict: null,
    link: readLink(),

    init: () => {
      initPromise ??= (async () => {
        const urlError = authErrorFromUrl();
        if (urlError) set({ error: urlError });
        const backend = await createBackend(get().mode).catch(() => null);
        set({ backend });
        if (backend) {
          backend.onAuthChange((user) => {
            const prev = get().user;
            set({ user });
            if (user && user.id !== prev?.id) void get().refresh();
            if (!user) set({ status: null, items: [] });
          });
          const user = await backend.getUser().catch(() => null);
          set({ user });
          if (user) await get().refresh();
        }
        set({ ready: true });
      })();
      return initPromise;
    },

    refresh: () => {
      refreshPromise ??= (async () => {
        await run('読み込み中', async (b) => {
          const [status, items] = await Promise.all([b.status(), b.list()]);
          set({ status, items });
          // 結びついていたクラウドの間取りが消えていたら解除
          const link = get().link;
          if (link && !items.some((i) => i.id === link.cloudId)) get().unlink();
        });
      })().finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    },

    signIn: async (email) => {
      const r = await run('メールを送信中', (b) => b.signInWithEmail(email, `${window.location.origin}/editor/`));
      return r !== null;
    },

    verifyCode: async (email, code) => {
      const r = await run('確認中', async (b) => {
        await b.verifyEmailCode(email, code);
        return true;
      });
      if (r) {
        const user = await get().backend!.getUser();
        set({ user });
        await get().refresh();
      }
      return !!r;
    },

    signOut: async () => {
      await run('ログアウト中', (b) => b.signOut());
      set({ user: null, status: null, items: [] });
      get().unlink();
    },

    saveNew: async (name, project) => {
      const item = await run('保存中', (b) => b.create(name, project));
      if (item) {
        setLink(item, project.projectId);
        await get().refresh();
      }
      return item;
    },

    overwrite: async (id, name, project, force = false) => {
      const link = get().link;
      // 結びついた間取りへの上書きは、読み込み後に別の端末で更新されていないか確認する
      const expected = !force && link?.cloudId === id ? link.updatedAt : undefined;
      let conflicted = false;
      const item = await run('上書き保存中', async (b) => {
        try {
          return await b.overwrite(id, name, project, expected);
        } catch (e) {
          if (e instanceof CloudError && e.code === 'conflict') conflicted = true;
          throw e;
        }
      });
      if (conflicted) {
        set({ conflict: { id, name } });
        return null;
      }
      if (item) {
        setLink(item, project.projectId);
        set({ conflict: null });
        await get().refresh();
      }
      return item;
    },

    open: async (id) => {
      const r = await run('開いています', (b) => b.load(id));
      if (!r) return null;
      setLink(r.item, r.project.projectId);
      set({ conflict: null });
      return r.project;
    },

    duplicate: async (id) => {
      const item = await run('複製中', (b) => b.duplicate(id));
      if (item) await get().refresh();
      return item;
    },

    remove: async (id) => {
      const ok = (await run('削除中', (b) => b.remove(id).then(() => true))) ?? false;
      if (ok) {
        if (get().link?.cloudId === id) get().unlink();
        await get().refresh();
      }
      return ok;
    },

    unlink: () => {
      writeLink(null);
      set({ link: null });
    },

    clearError: () => set({ error: null }),
    clearConflict: () => set({ conflict: null }),
  };
});

/** 現在のプラン（未ログイン・未設定・取得前は無料プラン） */
export function currentPlan(status: CloudStatus | null): PlanConfig {
  return planConfig(status?.planId);
}

/** テスト用: 初期化状態を戻す */
export function resetAccountForTesting() {
  initPromise = null;
  refreshPromise = null;
}
