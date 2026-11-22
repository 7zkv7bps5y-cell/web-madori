/**
 * アカウント・クラウド保存・プランの状態。
 * - クラウド保存に失敗しても、編集中の間取り（project）には一切触れない（エラー表示のみ）
 * - プランの判定はサーバー（my_cloud_status）の値を使う。未ログイン・未設定は無料プラン扱い
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
  // テスト用ビルド以外では、この分岐はビルド時に取り除かれる
  if (import.meta.env.MODE !== 'production' && mode === 'mock') {
    const { MockBackend } = await import('../cloud/mockBackend');
    return new MockBackend({ storage: localStorage });
  }
  return null;
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
  link: CloudLink | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  signIn: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  saveNew: (name: string, project: Project) => Promise<CloudItem | null>;
  overwrite: (id: string, name: string, project: Project) => Promise<CloudItem | null>;
  open: (id: string) => Promise<Project | null>;
  duplicate: (id: string) => Promise<CloudItem | null>;
  remove: (id: string) => Promise<boolean>;
  unlink: () => void;
  clearError: () => void;
}

const message = (e: unknown) => (e instanceof CloudError ? e.message : 'クラウド保存でエラーが発生しました。編集中の内容は消えていません。');

export const useAccount = create<AccountState>((set, get) => {
  /** 失敗しても例外を外に出さず、エラー表示にする */
  const run = async <T,>(label: string, fn: (b: CloudBackend) => Promise<T>): Promise<T | null> => {
    const b = get().backend;
    if (!b) return null;
    set({ busy: label, error: null });
    try {
      return await fn(b);
    } catch (e) {
      set({ error: message(e) });
      if (e instanceof CloudError && e.code === 'not_signed_in') set({ user: null, status: null, items: [] });
      return null;
    } finally {
      set({ busy: null });
    }
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
    link: readLink(),

    init: async () => {
      if (get().ready || get().backend) return;
      const backend = await createBackend(get().mode).catch(() => null);
      set({ backend });
      if (backend) {
        backend.onAuthChange((user) => {
          set({ user });
          if (user) void get().refresh();
          else set({ status: null, items: [] });
        });
        const user = await backend.getUser().catch(() => null);
        set({ user });
        if (user) await get().refresh();
      }
      set({ ready: true });
    },

    refresh: async () => {
      await run('読み込み中', async (b) => {
        const [status, items] = await Promise.all([b.status(), b.list()]);
        set({ status, items });
        // 結びついていたクラウドの間取りが消えていたら解除
        const link = get().link;
        if (link && !items.some((i) => i.id === link.cloudId)) get().unlink();
      });
    },

    signIn: async (email) => {
      const r = await run('メールを送信中', (b) => b.signInWithEmail(email, `${window.location.origin}/editor/`));
      return r !== null;
    },

    signOut: async () => {
      await run('ログアウト中', (b) => b.signOut());
      set({ user: null, status: null, items: [] });
      get().unlink();
    },

    saveNew: async (name, project) => {
      const item = await run('保存中', (b) => b.create(name, project));
      if (item) {
        const link = { cloudId: item.id, name: item.name, projectId: project.projectId };
        writeLink(link);
        set({ link });
        await get().refresh();
      }
      return item;
    },

    overwrite: async (id, name, project) => {
      const item = await run('上書き保存中', (b) => b.overwrite(id, name, project));
      if (item) {
        const link = { cloudId: item.id, name: item.name, projectId: project.projectId };
        writeLink(link);
        set({ link });
        await get().refresh();
      }
      return item;
    },

    open: async (id) => {
      const project = await run('開いています', (b) => b.load(id));
      if (project) {
        const item = get().items.find((i) => i.id === id);
        const link = { cloudId: id, name: item?.name ?? project.projectName, projectId: project.projectId };
        writeLink(link);
        set({ link });
      }
      return project;
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
  };
});

/** 現在のプラン（未ログイン・未設定・取得前は無料プラン） */
export function currentPlan(status: CloudStatus | null): PlanConfig {
  return planConfig(status?.planId);
}
