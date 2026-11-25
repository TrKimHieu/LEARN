import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import type { NativeAuthResponse } from '@/contracts';
import { Button, InlineError, PasswordField, Screen, Txt } from '@/components/ui';
import { ApiClientError, apiFetch, errorText, storeSession } from '@/lib/api-client';
import {
  validateChangePassword,
  type ChangePasswordErrors,
  type ChangePasswordFields,
} from '@/features/auth/change-password';
import { space } from '@/theme/tokens';

const EMPTY: ChangePasswordFields = { current: '', next: '', confirm: '' };

/** Đổi mật khẩu: server thu hồi mọi phiên rồi cấp phiên mới cho máy này, nên vẫn ở lại app. */
export default function ChangePasswordScreen() {
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const nextRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const set = (k: keyof ChangePasswordFields) => (v: string) => setFields((f) => ({ ...f, [k]: v }));

  async function onSubmit() {
    setDone(false);
    setFailure(null);
    const found = validateChangePassword(fields);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const data = await apiFetch<NativeAuthResponse>('/api/v1/auth/change-password', {
        method: 'POST',
        body: { currentPassword: fields.current, newPassword: fields.next },
      });
      await storeSession(data);
      setFields(EMPTY);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401)
        setErrors({ current: errorText(err, 'Mật khẩu hiện tại không đúng.') });
      else setFailure(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen width="reading">
      <View style={{ gap: space.lg }}>
        <PasswordField
          label="Mật khẩu hiện tại"
          value={fields.current}
          onChangeText={set('current')}
          error={errors.current}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
        />
        <PasswordField
          ref={nextRef}
          label="Mật khẩu mới"
          value={fields.next}
          onChangeText={set('next')}
          error={errors.next}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordField
          ref={confirmRef}
          label="Nhập lại mật khẩu mới"
          value={fields.confirm}
          onChangeText={set('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
        />
        {Boolean(failure) && (
          <InlineError>{errorText(failure, 'Chưa đổi được mật khẩu, vui lòng thử lại.')}</InlineError>
        )}
        {done && (
          <Txt variant="small" tone="subtle" accessibilityLiveRegion="polite">
            Đã đổi. Các thiết bị khác đã đăng xuất.
          </Txt>
        )}
        <Button label="Đổi mật khẩu" size="lg" fullWidth loading={pending} onPress={() => void onSubmit()} />
      </View>
    </Screen>
  );
}
