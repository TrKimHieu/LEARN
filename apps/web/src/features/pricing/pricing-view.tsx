'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SubscriptionResponse } from '@learn/contracts';
import {
  usePlans,
  useSubscription,
  useCheckout,
  useCancelSubscription,
} from '@/features/settings/subscription-api';
import { useAuth } from '@/features/auth/auth-context';
import { Brand } from '@/features/shell/brand';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Icon,
  InlineError,
  PartialNotice,
  ProgressBar,
  Skeleton,
  cn,
} from '@/components/ui';
import { errorDetail, errorText } from '@/lib/api-client';
import { humanizeCode } from '@/lib/humanize';
import { planLabel } from '@/features/settings/plan-label';
import { usePageTitle } from '@/lib/use-page-title';
import { planAction } from './plan-action';

const INTERVAL_LABEL: Record<string, string> = {
  month: 'tháng',
  year: 'năm',
  week: 'tuần',
  day: 'ngày',
};

const METRIC_LABEL: Record<string, string> = {
  COURSES_CREATED: 'Khóa học',
  DOCUMENTS_UPLOADED: 'Tài liệu / tháng',
  AI_JOBS_RUN: 'Lượt sinh AI / tháng',
};

/** Trang giá công khai: khách xem gói, người đã đăng nhập thấy thêm hạn mức đã dùng. */
export function PricingView() {
  usePageTitle('Bảng giá');
  const { status } = useAuth();
  const authed = status === 'authed';
  const plans = usePlans();
  const subscription = useSubscription(authed);
  const checkout = useCheckout();
  const cancelSubscription = useCancelSubscription();
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgradingCode, setUpgradingCode] = useState<string | null>(null);
  // Huỷ gói xác nhận 2 nhịp, cùng mẫu với "Xoá bài học" — cùng mức hậu quả, cùng mẫu.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const sub = authed ? subscription.data : undefined;

  async function handleUpgrade(planCode: string) {
    setActionError(null);
    setNotice(null);
    setUpgradingCode(planCode);
    try {
      await checkout.mutateAsync(planCode);
      setNotice(`Đã chuyển sang gói ${planLabel(planCode)}.`);
    } catch (err) {
      setActionError(errorText(err, 'Không nâng cấp được gói, vui lòng thử lại.'));
    } finally {
      setUpgradingCode(null);
    }
  }

  async function handleCancel() {
    setActionError(null);
    setNotice(null);
    try {
      await cancelSubscription.mutateAsync();
      setConfirmingCancel(false);
    } catch (err) {
      setActionError(errorText(err, 'Không huỷ được gói, vui lòng thử lại.'));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href={authed ? '/dashboard' : '/login'} className="rounded-md focus-ring">
          <Brand />
        </Link>
        {authed ? (
          <ButtonLink href="/dashboard" variant="ghost" size="sm">
            Về trang học
          </ButtonLink>
        ) : (
          status === 'guest' && (
            <ButtonLink href="/login?next=/pricing" variant="secondary" size="sm">
              Đăng nhập
            </ButtonLink>
          )
        )}
      </header>

      <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">Bảng giá</h1>

      {authed && subscription.isLoading && <Skeleton className="mt-8 h-40 rounded-card" />}
      {authed && !subscription.isLoading && (subscription.isError || !sub) && (
        <ErrorState
          className="mt-8"
          title="Không tải được thông tin gói hiện tại"
          description={errorText(subscription.error, 'Vui lòng thử lại.')}
          detail={errorDetail(subscription.error)}
          onRetry={() => void subscription.refetch()}
        />
      )}
      {sub && <UsageCard sub={sub} />}

      {sub?.billingMode === 'demo' && (
        <PartialNotice className="mt-4">
          <b>Chế độ demo:</b> nâng cấp không phát sinh giao dịch thật.
        </PartialNotice>
      )}

      <section aria-label="Các gói" className="mt-8">
        {plans.isLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-80 rounded-card" />
            ))}
          </div>
        )}

        {!plans.isLoading && (plans.isError || !plans.data) && (
          <ErrorState
            title="Không tải được danh sách gói"
            description={errorText(plans.error, 'Vui lòng thử lại.')}
            detail={errorDetail(plans.error)}
            onRetry={() => void plans.refetch()}
          />
        )}

        {plans.data && (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.data.map((plan) => {
              // Đã đăng nhập mà subscription lỗi/chưa tải: chưa biết gói nào đang dùng, không cho bấm.
              const action =
                authed && !sub ? 'none' : planAction(plan, sub?.planCode ?? null, authed);
              const current = action === 'current' || action === 'cancel';
              return (
                <Card
                  key={plan.code}
                  className={cn(
                    'relative flex flex-col',
                    current && 'border-fg ring-1 ring-fg',
                    plan.isFutureExtension && 'border-dashed',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-fg">{plan.name}</h2>
                    {current && (
                      <Badge tone="info" icon="check">
                        Đang dùng
                      </Badge>
                    )}
                  </div>

                  {/* Gói "mở rộng tương lai" có priceCents = 0 làm chỗ giữ chỗ, không phải
                      vì miễn phí — hiện "Miễn phí" là nói sai. */}
                  <p className="mt-3 text-4xl font-semibold text-fg">
                    {plan.isFutureExtension ? (
                      <span className="text-3xl text-fg-subtle">Sắp có</span>
                    ) : (
                      <>
                        {plan.priceCents === 0
                          ? 'Miễn phí'
                          : `$${(plan.priceCents / 100).toFixed(0)}`}
                        {plan.priceCents > 0 && (
                          <span className="font-sans text-sm font-medium text-fg-muted">
                            {' '}
                            / {INTERVAL_LABEL[plan.interval] ?? humanizeCode(plan.interval)}
                          </span>
                        )}
                      </>
                    )}
                  </p>

                  <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-fg-muted">
                    {plan.features
                      .map((feature) => feature.replace('AI job', 'lượt sinh AI'))
                      .map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
                          {f}
                        </li>
                      ))}
                  </ul>

                  <div className="mt-auto pt-6">
                    {action === 'current' && (
                      <p className="flex h-10 items-center justify-center gap-1.5 rounded-control bg-accent-soft text-sm font-semibold text-accent">
                        <Icon name="check" size={15} />
                        Gói hiện tại
                      </p>
                    )}
                    {action === 'soon' && (
                      <Button variant="secondary" fullWidth disabled>
                        Sắp có
                      </Button>
                    )}
                    {action === 'login' && (
                      <ButtonLink href="/login?next=/pricing" fullWidth>
                        Nâng cấp
                      </ButtonLink>
                    )}
                    {action === 'upgrade' && (
                      <Button
                        fullWidth
                        onClick={() => void handleUpgrade(plan.code)}
                        loading={upgradingCode === plan.code}
                        disabled={upgradingCode !== null && upgradingCode !== plan.code}
                      >
                        {upgradingCode === plan.code ? 'Đang xử lý…' : 'Nâng cấp'}
                      </Button>
                    )}
                    {action === 'cancel' && sub && (
                      <CancelControl
                        sub={sub}
                        confirming={confirmingCancel}
                        setConfirming={setConfirmingCancel}
                        pending={cancelSubscription.isPending}
                        onCancel={() => void handleCancel()}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {notice && (
          <p role="status" className="mt-4 text-sm font-semibold text-ok">
            {notice}
          </p>
        )}
        {actionError && <InlineError className="mt-4">{actionError}</InlineError>}
      </section>
    </div>
  );
}

function CancelControl({
  sub,
  confirming,
  setConfirming,
  pending,
  onCancel,
}: {
  sub: SubscriptionResponse;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  if (sub.cancelAtPeriodEnd) {
    return (
      <p className="text-center text-sm text-fg-subtle">
        Huỷ vào{' '}
        {sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd).toLocaleDateString('vi-VN')
          : 'cuối kỳ'}
      </p>
    );
  }
  if (!confirming) {
    return (
      <Button variant="ghost" fullWidth onClick={() => setConfirming(true)}>
        Huỷ gói (hiệu lực cuối kỳ)
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="danger" size="sm" onClick={onCancel} loading={pending}>
        {pending ? 'Đang huỷ…' : 'Xác nhận huỷ'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Không huỷ
      </Button>
    </div>
  );
}

function UsageCard({ sub }: { sub: SubscriptionResponse }) {
  return (
    <Card padded={false} className="mt-8 overflow-hidden">
      <p className="border-b border-line px-6 py-4 text-sm text-fg-subtle">
        Bạn đang dùng <b className="text-fg">{planLabel(sub.planCode)}</b>
      </p>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        {Object.entries(sub.usage).map(([metric, u]) => {
          // Giới hạn theo từng tài liệu, không có số đã dùng để đo.
          if (u.window === 'per_document') {
            return (
              <div key={metric} className="text-sm">
                <p className="font-semibold text-fg-muted">Số trang mỗi tài liệu</p>
                <p className="mt-1.5 text-xs text-fg-subtle">
                  {u.limit !== null ? `Tối đa ${u.limit} trang` : 'Không giới hạn'}
                </p>
              </div>
            );
          }
          const atLimit = u.limit !== null && u.used >= u.limit;
          const name = METRIC_LABEL[metric] ?? humanizeCode(metric);
          return (
            <div key={metric}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg-muted">{name}</span>
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    atLimit ? 'text-bad' : 'text-fg-subtle',
                  )}
                >
                  {u.used}
                  {u.limit !== null ? ` / ${u.limit}` : ' · không giới hạn'}
                </span>
              </div>
              {u.limit !== null ? (
                <ProgressBar
                  size="sm"
                  value={u.used}
                  max={u.limit}
                  label={`${name}: ${u.used} trên ${u.limit}`}
                />
              ) : (
                <div className="h-2 rounded-pill bg-[repeating-linear-gradient(90deg,var(--track)_0_6px,transparent_6px_10px)]" />
              )}
              {atLimit && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-bad">
                  <Icon name="alert" size={12} />
                  Đã chạm hạn mức
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
