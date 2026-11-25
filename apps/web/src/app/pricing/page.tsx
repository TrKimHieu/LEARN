import { PricingView } from '@/features/pricing/pricing-view';

// Nằm ngoài `(app)` để không qua `ProtectedRoute`: khách cũng xem được bảng giá.
export default function PricingPage() {
  return <PricingView />;
}
