import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch } from '../utils.mjs';

const BASE_URL = process.env.TEST_API_URL || 'https://13-211-191-95.sslip.io';

test('TC-10 (Integration - Security): Yeu cau Presigned URL tai tai lieu khi chua dang nhap bi chan 401', async () => {
  const fakeCourseId = '00000000-0000-0000-0000-000000000001';
  const res = await safeFetch(BASE_URL + '/api/v1/courses/' + fakeCourseId + '/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'test-document.pdf',
      fileSize: 1024 * 500,
      mimeType: 'application/pdf'
    })
  });
  assert.equal(res.status, 401, 'Chua dang nhap phai bi tu choi 401');
});

test('TC-10b (Integration - Storage Health): Kiem tra ha tang luu tru MinIO S3 san sang', async () => {
  const res = await safeFetch(BASE_URL + '/api/v1/health/ready');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ready');
  assert.equal(data.checks?.storage, 'up', 'Kho luu tru tai lieu MinIO S3 phai o trang thai up');
});
