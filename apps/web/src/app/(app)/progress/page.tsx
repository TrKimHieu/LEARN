'use client';

import { Card, ErrorState, Skeleton } from '@/components/ui';
import { isDone } from '@/features/home/today-plan';
import { useTodayPlan } from '@/features/home/use-today-plan';
import { usePageTitle } from '@/lib/use-page-title';

export default function ProgressPage() {
  usePageTitle('Tiến độ');
  const { gate, plan, overview, liveDue, retry } = useTodayPlan();
  const stats = overview.data;
  const completed = plan?.tasks.filter((task) => isDone(plan, task, liveDue)).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Tiến độ học tập</h1>
      {gate === 'error' ? (
        <ErrorState title="Không tải được tiến độ" onRetry={retry} />
      ) : gate === 'wait' || !stats ? (
        <div role="status"><span className="sr-only">Đang tải tiến độ</span><Skeleton className="h-24 rounded-card" /></div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          <Card><dt>Chuỗi học hiện tại</dt><dd className="text-xl font-bold">{stats.activeStreak} ngày</dd></Card>
          {stats.xpToday !== undefined && (
            <Card><dt>XP hôm nay</dt><dd className="text-xl font-bold">{stats.xpToday}/{stats.dailyXpCap ?? 100}</dd></Card>
          )}
          <Card>
            <dt>Việc hôm nay</dt>
            <dd className="text-xl font-bold">
              {plan?.tasks.length ? `${completed}/${plan.tasks.length} đã xong` : 'Chưa có việc'}
            </dd>
          </Card>
        </dl>
      )}
    </div>
  );
}
