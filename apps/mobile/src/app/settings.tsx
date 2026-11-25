import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileCard } from '@/features/auth/components/profile-card';
import { ReminderToggle } from '@/features/reviews/components/review-entry';
import { LeaderboardToggle } from '@/features/friends/components/leaderboard-toggle';
import { ThemePicker } from '@/features/settings/components/theme-picker';
import { useSubscription } from '@/features/settings/subscription-api';
import { config } from '@/lib/config';
import { routes } from '@/lib/routes';
import { APP_VERSION, useServerMeta } from '@/lib/server-meta';

const PLAN_NAME: Record<string, string> = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' };
const planName = (code: string) => PLAN_NAME[code] ?? code;

export default function SettingsScreen() {
  const subscription = useSubscription();
  const { meta, contractsDiffer } = useServerMeta();
  const isAdmin = useAuth().user?.role === 'ADMIN';

  return (
    <Screen width="reading" onRefresh={() => subscription.refetch()}>

      <ProfileCard />
      <ThemePicker />
      <ReminderToggle />
      <LeaderboardToggle />
      <Button label="Quản lý dung lượng" variant="secondary" icon="file" onPress={() => router.push(routes.storage)} />
      <Button label="Đổi mật khẩu" variant="secondary" icon="user" onPress={() => router.push(routes.changePassword)} />
      {/* Quản trị không còn là tab riêng (2026-11-19); server vẫn chặn thật bằng RolesGuard. */}
      {isAdmin && <Button label="Quản trị" variant="secondary" icon="shield" onPress={() => router.push(routes.admin)} />}

      <Button
        label={`Gói ${subscription.data ? planName(subscription.data.planCode) : '…'} · Xem các gói`}
        variant="secondary"
        icon="arrow-right"
        onPress={() => router.push(routes.pricing)}
      />

      <View style={{ gap: 2 }}>
        <Txt variant="caption" tone="subtle" style={{ textAlign: 'center' }}>
          Ứng dụng {APP_VERSION} · Máy chủ {config.apiUrl}
        </Txt>
        {/* Chỉ người phát triển cần biết schema lệch — app và máy chủ build từ hai commit khác nhau của `packages/contracts`. */}
        {__DEV__ && contractsDiffer && meta && (
          <Txt variant="caption" tone="subtle" style={{ textAlign: 'center' }}>
            Contracts khác máy chủ ({meta.contractsHash})
          </Txt>
        )}
      </View>
    </Screen>
  );
}
