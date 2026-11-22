/**
 * クラウド保存の動作モード
 * - supabase: VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が設定されている（本番・検証環境）
 * - mock: テスト用ビルド（vite build --mode e2e）かつ VITE_DEV_MOCK_CLOUD=1 のときだけ。
 *         本番ビルド（mode=production）では、この分岐自体がビルドから除かれる
 * - unconfigured: 未設定。クラウド保存は「準備中」と表示し、動いているように見せない
 */
export type CloudMode = 'supabase' | 'mock' | 'unconfigured';

export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function cloudMode(): CloudMode {
  if (supabaseEnv()) return 'supabase';
  if (import.meta.env.MODE !== 'production' && import.meta.env.VITE_DEV_MOCK_CLOUD === '1') return 'mock';
  return 'unconfigured';
}
