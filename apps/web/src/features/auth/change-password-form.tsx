'use client';

import { useState, type FormEvent } from 'react';
import type { UserPublic } from '@learn/contracts';
import { Button, Card, Field, InlineError, PasswordInput, SectionTitle } from '@/components/ui';
import { ApiClientError, apiFetch, errorText, setAccessToken } from '@/lib/api-client';
import {
  validateChangePassword,
  type ChangePasswordErrors,
  type ChangePasswordFields,
} from './change-password';

const EMPTY: ChangePasswordFields = { current: '', next: '', confirm: '' };

/** Đổi mật khẩu trong Cài đặt. Server thu hồi mọi phiên và cấp phiên mới (cookie + access token) cho trình duyệt này. */
export function ChangePasswordForm() {
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof ChangePasswordFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setFailure(null);
    const found = validateChangePassword(fields);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const data = await apiFetch<{ user: UserPublic; accessToken: string }>(
        '/api/v1/auth/change-password',
        { method: 'POST', body: { currentPassword: fields.current, newPassword: fields.next } },
      );
      setAccessToken(data.accessToken);
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
    <Card>
      <SectionTitle>Đổi mật khẩu</SectionTitle>
      <form onSubmit={onSubmit} className="mt-2 grid gap-4" noValidate>
        <Field label="Mật khẩu hiện tại" htmlFor="current-password" error={errors.current}>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={fields.current}
            onChange={set('current')}
            invalid={Boolean(errors.current)}
          />
        </Field>
        <Field label="Mật khẩu mới" htmlFor="new-password" error={errors.next}>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={fields.next}
            onChange={set('next')}
            invalid={Boolean(errors.next)}
          />
        </Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="confirm-password" error={errors.confirm}>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={fields.confirm}
            onChange={set('confirm')}
            invalid={Boolean(errors.confirm)}
          />
        </Field>
        {Boolean(failure) && (
          <InlineError>
            {errorText(failure, 'Chưa đổi được mật khẩu, vui lòng thử lại.')}
          </InlineError>
        )}
        {done && (
          <p role="status" className="text-sm text-fg-muted">
            Đã đổi. Các thiết bị khác đã đăng xuất.
          </p>
        )}
        <Button type="submit" loading={pending} className="justify-self-start max-md:h-11">
          Đổi mật khẩu
        </Button>
      </form>
    </Card>
  );
}
