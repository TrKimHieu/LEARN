import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch } from '../utils.mjs';

const BASE_URL = process.env.TEST_WEB_URL || 'https://13-211-191-95.sslip.io';

test('TC-06 & TC-15 (E2E): Kiem thu toan trinh truy cap Web giao dien nguoi dung va trang thai san sang', async () => {
  const loginPageRes = await safeFetch(BASE_URL + '/login', {
    headers: { 'User-Agent': 'LEARN-E2E-Tester/1.0' }
  });
  assert.equal(loginPageRes.status, 200, 'Trang dang nhap /login phai phan hoi HTTP 200');
  const loginHtml = await loginPageRes.text();
  assert.ok(loginHtml.includes('<!DOCTYPE html>'), 'Phan hoi phai la trang web HTML');

  const coursesPageRes = await safeFetch(BASE_URL + '/courses', {
    headers: { 'User-Agent': 'LEARN-E2E-Tester/1.0' }
  });
  assert.equal(coursesPageRes.status, 200, 'Trang /courses phai phan hoi HTTP 200');

  const pricingPageRes = await safeFetch(BASE_URL + '/pricing', {
    headers: { 'User-Agent': 'LEARN-E2E-Tester/1.0' }
  });
  assert.equal(pricingPageRes.status, 200, 'Trang bang gia /pricing phai phan hoi HTTP 200');

  const viaHeader = coursesPageRes.headers.get('via');
  assert.ok(viaHeader?.includes('Caddy') || loginPageRes.headers.get('server') !== null, 'Phai duoc phuc vu qua Reverse Proxy an toan');
});
