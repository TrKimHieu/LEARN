import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch } from '../utils.mjs';

const BASE_URL = process.env.TEST_API_URL || 'https://13-211-191-95.sslip.io';

test('TC-13 (Integration - Security): Yeu cau sinh bai hoc AI khi chua dang nhap bi tu choi 401', async () => {
  const fakeCourseId = '00000000-0000-0000-0000-000000000001';
  const res = await safeFetch(BASE_URL + '/api/v1/ai/courses/' + fakeCourseId + '/generate-lessons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentIds: ['00000000-0000-0000-0000-000000000002'],
      difficulty: 'standard'
    })
  });
  assert.equal(res.status, 401, 'Endpoint sinh bai hoc yeu cau @Auth');
});

test('TC-13b (Integration - BullMQ Queue): Kiem tra ha tang Redis hang doi phuc vu AIJob san sang', async () => {
  const res = await safeFetch(BASE_URL + '/api/v1/health/ready');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.checks?.redis, 'up', 'Hang doi BullMQ (Redis) phai san sang de nhan AIJob');
  assert.equal(data.checks?.database, 'up', 'Co so du lieu phai san sang');
});
