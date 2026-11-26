import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch } from '../utils.mjs';

const BASE_URL = process.env.TEST_API_URL || 'https://13-211-191-95.sslip.io';

test('TC-04 (Integration - EG): Dang nhap voi mat khau sai tra ve HTTP 401 va khong ro ri hash', async () => {
  const res = await safeFetch(BASE_URL + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nonexistent.learner@learn.local',
      password: 'WrongPassword123'
    })
  });

  assert.equal(res.status, 401, 'Dang nhap sai phai tra ve HTTP 401');
  const body = await res.json();
  assert.ok(body.code || body.title, 'Response phai co ma loi chuan');
  assert.equal(body.password, undefined);
  assert.equal(body.passwordHash, undefined);
  assert.equal(body.hash, undefined);
});

test('TC-04b (Integration - BVA): Gui request login voi body rong tra ve HTTP 400 Bad Request', async () => {
  const res = await safeFetch(BASE_URL + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400, 'Body rong phai bi tu choi voi HTTP 400');
  const body = await res.json();
  assert.equal(body.code, 'VALIDATION_FAILED');
});

test('TC-05b (Integration): Thu nghiem lam moi phien (Refresh Token) khi chua dang nhap tra ve 401', async () => {
  const res = await safeFetch(BASE_URL + '/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(res.status, 401);
});
