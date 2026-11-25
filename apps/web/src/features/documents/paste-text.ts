import { importTextLimits, type ImportTextDocumentInput } from '@learn/contracts';

/** Văn bản dán vào thành một tài liệu (một "trang" không đánh số); `null` khi chưa gửi được. */
export function buildPastedText(title: string, text: string): ImportTextDocumentInput | null {
  const name = title.trim();
  if (!name || name.length > 255 || !text.trim()) return null;
  if (text.length > importTextLimits.maxCharsPerPage) return null;
  return {
    filename: name,
    sourceMimeType: 'text/plain',
    sourceSizeBytes: new TextEncoder().encode(text).length,
    method: 'TEXT',
    pages: [{ page: null, text }],
  };
}
