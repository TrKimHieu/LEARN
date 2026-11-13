import { ApiError } from '../exceptions/errors';

/**
 * `Idempotency-Key` cho các lượt chấm thẻ (ôn câu hỏi bài tập và ôn Thẻ): định dạng khoá, nhận biết
 * P2002 trên `(userId, idempotencyKey)` và 409 `IDEMPOTENCY_KEY_REUSED`. Đặt ở `core` để hai domain
 * dùng chung mà không import file nội bộ của nhau (`boundary/no-cross-module-import`).
 * `learning/application/submit-idempotency.ts` là bản riêng cùng quy ước cho lượt nộp bài.
 */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function parseIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !KEY_PATTERN.test(raw)) {
    throw ApiError.badRequest('Idempotency-Key phải gồm 8–128 ký tự chữ, số, "-" hoặc "_".');
  }
  return raw;
}

/** Prisma P2002 trên ràng buộc `(userId, idempotencyKey)`. */
export function isIdempotencyKeyViolation(e: unknown): boolean {
  if (!e || typeof e !== 'object' || (e as { code?: unknown }).code !== 'P2002') return false;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  return JSON.stringify(target ?? '').includes('idempotencyKey');
}

export function idempotencyKeyReused(): ApiError {
  return new ApiError(409, 'CONFLICT', 'Idempotency-Key đã dùng cho một lượt chấm khác.', {
    reason: 'IDEMPOTENCY_KEY_REUSED',
  });
}
