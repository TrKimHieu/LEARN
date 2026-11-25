export interface ChangePasswordFields {
  current: string;
  next: string;
  confirm: string;
}
export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordFields, string>>;

/** Kiểm tại máy trước khi gửi; giới hạn 8–72 theo `changePasswordSchema`. */
export function validateChangePassword(f: ChangePasswordFields): ChangePasswordErrors {
  const e: ChangePasswordErrors = {};
  if (!f.current) e.current = 'Nhập mật khẩu hiện tại.';
  if (f.next.length < 8) e.next = 'Mật khẩu mới cần ít nhất 8 ký tự.';
  else if (f.next.length > 72) e.next = 'Mật khẩu tối đa 72 ký tự.';
  if (!e.next && f.confirm !== f.next) e.confirm = 'Hai mật khẩu chưa khớp.';
  return e;
}
