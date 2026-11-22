/**
 * 料金プランの設定（ここが唯一の定義）。
 * - 保存上限は「月ごとの保存回数」ではなく「クラウドに同時に保持できる件数」
 * - データベース側の初期値（supabase/migrations の plans 表）も同じ値にする。
 *   値を変えたらマイグレーションも更新すること（plans.test.ts で一致を確認している）
 * - PNG・PDF・.floorplan の出力に回数制限は設けない（ここでも設定項目を持たない）
 */

export type PlanId = 'free' | 'premium';

export interface PlanConfig {
  id: PlanId;
  name: string;
  /** クラウドに同時に保存できる最大件数 */
  cloudLimit: number;
  /** 広告を表示するか */
  showAds: boolean;
  /** 月額（円、税込の想定）。0 = 無料 */
  monthlyPriceJpy: number;
  /**
   * Office 系形式（Excel など）の月あたりの出力回数。
   * 現時点で Office 系の出力機能は存在しないため null（未提供）。提供時に値を決める。
   */
  officeExportsPerMonth: number | null;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: { id: 'free', name: '無料プラン', cloudLimit: 3, showAds: true, monthlyPriceJpy: 0, officeExportsPerMonth: null },
  premium: { id: 'premium', name: 'プレミアム', cloudLimit: 30, showAds: false, monthlyPriceJpy: 500, officeExportsPerMonth: null },
};

export const DEFAULT_PLAN: PlanId = 'free';

export function planConfig(id: string | null | undefined): PlanConfig {
  return PLANS[(id ?? DEFAULT_PLAN) as PlanId] ?? PLANS[DEFAULT_PLAN];
}

/** 新規にクラウド保存できるか（上書きは件数を使わないので常に可） */
export function canCreateCloudSave(used: number, limit: number): boolean {
  return used < limit;
}
