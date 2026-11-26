import test from 'node:test';
import assert from 'node:assert/strict';

function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, error: 'EMAIL_REQUIRED' };
  const trimmed = email.trim();
  if (!trimmed) return { valid: false, error: 'EMAIL_EMPTY' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return { valid: false, error: 'INVALID_EMAIL' };
  return { valid: true, value: trimmed.toLowerCase() };
}

function validatePassword(password, minLength = 8) {
  if (typeof password !== 'string') return { valid: false, error: 'PASSWORD_REQUIRED' };
  if (password.length < minLength) return { valid: false, error: 'PASSWORD_TOO_SHORT' };
  return { valid: true };
}

function validateLoginInput(input) {
  const emailRes = validateEmail(input?.email);
  if (!emailRes.valid) return emailRes;
  const passRes = validatePassword(input?.password);
  if (!passRes.valid) return passRes;
  return { valid: true, data: { email: emailRes.value, password: input.password } };
}

test('TC-01 (Unit - EP): Email hop le va mat khau du do dai duoc chap nhan', () => {
  const result = validateLoginInput({
    email: 'Student@Learn.Local ',
    password: 'SecurePassword123'
  });
  assert.equal(result.valid, true);
  assert.equal(result.data.email, 'student@learn.local');
});

test('TC-02 (Unit - EP): Email khong co ky tu @ hoac sai cau truc bi tu choi', () => {
  const invalidEmails = ['plainaddress', 'missingdomain@', '@missingusername.com', 'user@.com'];
  for (const email of invalidEmails) {
    const res = validateEmail(email);
    assert.equal(res.valid, false, 'Email phai bi tu choi: ' + email);
    assert.equal(res.error, 'INVALID_EMAIL');
  }
});

test('TC-03 (Unit - BVA): Phan tich gia tri bien cho do dai mat khau (nguong 8 ky tu)', () => {
  assert.equal(validatePassword('1234567').valid, false);
  assert.equal(validatePassword('1234567').error, 'PASSWORD_TOO_SHORT');
  assert.equal(validatePassword('12345678').valid, true);
  assert.equal(validatePassword('123456789').valid, true);
});

test('TC-03b (Unit - EG): Doan loi khi nguoi dung nhap mat khau trong hoac chi chua dau cach', () => {
  assert.equal(validatePassword('').valid, false);
  assert.equal(validateEmail('').error, 'EMAIL_EMPTY');
  assert.equal(validateEmail('   ').error, 'EMAIL_EMPTY');
});
