import { describe, expect, it } from 'vitest';
import { validateChangePassword } from './change-password';

describe('validateChangePassword', () => {
  it('thiếu mật khẩu hiện tại', () => {
    expect(validateChangePassword({ current: '', next: '12345678', confirm: '12345678' })).toEqual({
      current: 'Nhập mật khẩu hiện tại.',
    });
  });
  it('mật khẩu mới dưới 8 ký tự', () => {
    expect(validateChangePassword({ current: 'x', next: '1234567', confirm: '1234567' })).toEqual({
      next: 'Mật khẩu mới cần ít nhất 8 ký tự.',
    });
  });
  it('mật khẩu mới quá 72 ký tự', () => {
    const long = 'a'.repeat(73);
    expect(validateChangePassword({ current: 'x', next: long, confirm: long }).next).toBe(
      'Mật khẩu tối đa 72 ký tự.',
    );
  });
  it('nhập lại không khớp', () => {
    expect(validateChangePassword({ current: 'x', next: '12345678', confirm: '12345679' })).toEqual(
      {
        confirm: 'Hai mật khẩu chưa khớp.',
      },
    );
  });
  it('hợp lệ', () => {
    expect(validateChangePassword({ current: 'x', next: '12345678', confirm: '12345678' })).toEqual(
      {},
    );
  });
});
