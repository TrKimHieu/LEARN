'use client';

import Link from 'next/link';
import { UserText } from '@/components/ui/user-text';
import { useSubscription } from '@/features/settings/subscription-api';
import { useAuth } from '@/features/auth/auth-context';
import { Avatar } from '@/features/shell/user-menu';
import { ThemeSegmented } from '@/components/shared/theme-toggle';
import { ReminderSettings } from '@/features/flashcards/reminder-settings';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { LeaderboardSettings } from '@/features/friends/leaderboard-settings';
import { Badge, Button, Card, Icon, PageHeader } from '@/components/ui';
import { humanizeCode } from '@/lib/humanize';
import { planLabel } from '@/features/settings/plan-label';
import { usePageTitle } from '@/lib/use-page-title';

const ROLE_LABEL: Record<string, string> = {
  LEARNER: 'Người học',
  ADMIN: 'Quản trị viên',
};

/** Gói và hạn mức nằm ở `/pricing`; Cài đặt chỉ còn một dòng dẫn tới đó. */
function PlanRow() {
  const { data } = useSubscription();
  return (
    <Card className="mt-12 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">
        Gói <b className="text-fg">{data ? planLabel(data.planCode) : '…'}</b>
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-accent underline underline-offset-2 hover:no-underline focus-ring"
      >
        Xem các gói
        <Icon name="arrow-right" size={15} />
      </Link>
    </Card>
  );
}

export default function SettingsPage() {
  usePageTitle('Cài đặt');
  const { user, logoutAll } = useAuth();

  return (
    <div>
      <PageHeader title="Cài đặt" />

      {/* ------------------------------------------- hồ sơ + giao diện */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={user?.displayName} className="size-14 text-xl" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-fg">
                <UserText>{user?.displayName}</UserText>
              </p>
              <p className="truncate text-sm text-fg-subtle">
                <UserText>{user?.email}</UserText>
              </p>
              {user?.role && (
                <Badge
                  tone={user.role === 'ADMIN' ? 'info' : 'neutral'}
                  icon={user.role === 'ADMIN' ? 'shield' : 'user'}
                  className="mt-2"
                >
                  {ROLE_LABEL[user.role] ?? humanizeCode(user.role)}
                </Badge>
              )}
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-fg-subtle">Đăng xuất khỏi mọi trình duyệt đang đăng nhập.</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-bad hover:bg-bad-soft hover:text-bad"
              onClick={() => void logoutAll()}
            >
              <Icon name="logout" size={15} />
              Đăng xuất mọi thiết bị
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-fg">Giao diện</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            &quot;Tự động&quot; theo chế độ sáng/tối của thiết bị. Lựa chọn được lưu trên trình
            duyệt này.
          </p>
          <ThemeSegmented className="mt-4" />
        </Card>

        <ReminderSettings />
        <LeaderboardSettings />
        <ChangePasswordForm />
      </div>

      <PlanRow />
    </div>
  );
}
