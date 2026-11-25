import type { PlanPublic } from '@learn/contracts';

// `none`: gói Free khi đang dùng gói trả phí — về Free bằng "Hủy gói" trên thẻ đang dùng.
export type PlanAction = 'current' | 'upgrade' | 'cancel' | 'login' | 'soon' | 'none';

/**
 * Nút trên thẻ gói. `currentCode` null khi chưa đăng nhập hoặc chưa tải được subscription —
 * người đã đăng nhập mà chưa có subscription vẫn là FREE (backend trả `planCode: 'FREE'`).
 */
export function planAction(
  plan: Pick<PlanPublic, 'code' | 'priceCents' | 'isFutureExtension'>,
  currentCode: string | null,
  authed: boolean,
): PlanAction {
  if (plan.isFutureExtension) return 'soon';
  if (!authed) return plan.priceCents > 0 ? 'login' : 'none';
  const current = (currentCode ?? 'FREE') === plan.code;
  if (current) return plan.priceCents > 0 ? 'cancel' : 'current';
  return plan.priceCents > 0 ? 'upgrade' : 'none';
}
