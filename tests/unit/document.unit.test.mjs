import test from 'node:test';
import assert from 'node:assert/strict';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 26,214,400 bytes

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown'
]);

function validateFileSize(bytes, maxBytes = MAX_DOCUMENT_BYTES) {
  if (typeof bytes !== 'number' || bytes <= 0) {
    return { valid: false, error: 'FILE_EMPTY_OR_INVALID' };
  }
  if (bytes > maxBytes) {
    return { valid: false, error: 'FILE_TOO_LARGE', maxBytes, actualBytes: bytes };
  }
  return { valid: true };
}

function isAllowedDocumentMime(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return false;
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

test('TC-07 & TC-08 (Unit - BVA): Phan tich gia tri bien dung luong tep (nguong 25 MB)', () => {
  assert.equal(validateFileSize(MAX_DOCUMENT_BYTES - 1).valid, true);
  assert.equal(validateFileSize(MAX_DOCUMENT_BYTES).valid, true);
  const overRes = validateFileSize(MAX_DOCUMENT_BYTES + 1);
  assert.equal(overRes.valid, false);
  assert.equal(overRes.error, 'FILE_TOO_LARGE');
});

test('TC-08b (Unit - EG): Doan loi khi tep 0 byte hoac so am', () => {
  assert.equal(validateFileSize(0).error, 'FILE_EMPTY_OR_INVALID');
  assert.equal(validateFileSize(-100).error, 'FILE_EMPTY_OR_INVALID');
});

test('TC-09 (Unit - EP): Phan vung tuong duong dinh dang tep tai len', () => {
  assert.equal(isAllowedDocumentMime('application/pdf'), true);
  assert.equal(isAllowedDocumentMime('text/markdown'), true);
  assert.equal(isAllowedDocumentMime('text/plain'), true);
  assert.equal(isAllowedDocumentMime('application/x-msdownload'), false);
  assert.equal(isAllowedDocumentMime('application/x-sh'), false);
  assert.equal(isAllowedDocumentMime('text/html'), false);
});

test('TC-09b (Unit): Kiem tra ham dinh dang dung luong hien thi', () => {
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(1024 * 50), '50.0 KB');
  assert.equal(formatFileSize(MAX_DOCUMENT_BYTES), '25.0 MB');
});
