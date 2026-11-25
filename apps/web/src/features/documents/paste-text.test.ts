import { describe, expect, it } from 'vitest';
import { importTextLimits } from '@learn/contracts';
import { buildPastedText } from './paste-text';

describe('buildPastedText', () => {
  it('thiếu tiêu đề hoặc chỉ có khoảng trắng thì chưa gửi', () => {
    expect(buildPastedText('', 'abc')).toBeNull();
    expect(buildPastedText('T', '   \n ')).toBeNull();
  });
  it('quá giới hạn ký tự thì chưa gửi', () => {
    expect(buildPastedText('T', 'a'.repeat(importTextLimits.maxCharsPerPage + 1))).toBeNull();
  });
  it('hợp lệ: một trang TEXT, kích thước tính theo byte UTF-8', () => {
    expect(buildPastedText(' Ghi chú ', 'Xin chào')).toEqual({
      filename: 'Ghi chú',
      sourceMimeType: 'text/plain',
      sourceSizeBytes: 9,
      method: 'TEXT',
      pages: [{ page: null, text: 'Xin chào' }],
    });
  });
});
