import { Screen } from '@/components/ui';
import { CurrentPlan } from '@/features/pricing/components/current-plan';
import { PlanList } from '@/features/pricing/components/plan-list';
import { usePlans, useSubscription } from '@/features/settings/subscription-api';

/** Bảng giá: hạn mức đã dùng ở trên, các gói xếp dọc bên dưới. Mở từ Cài đặt và băng hết hạn mức. */
export default function PricingScreen() {
  // Chỉ để kéo-làm-mới; các thẻ bên dưới tự dùng cùng query (TanStack Query gộp request).
  const plans = usePlans();
  const subscription = useSubscription();

  return (
    <Screen width="reading" onRefresh={() => Promise.all([plans.refetch(), subscription.refetch()])}>
      <CurrentPlan />
      <PlanList />
    </Screen>
  );
}
