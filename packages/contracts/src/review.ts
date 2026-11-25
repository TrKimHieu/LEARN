import { z } from 'zod';

/**
 * Ôn tập ngắt quãng (SRS, mobile R5). Thẻ = câu hỏi của bài tập người dùng đã nộp ít nhất một lần,
 * nên đáp án trên thẻ chưa bao giờ lộ trước khi nộp. Server giữ lịch SM-2.
 */
export const reviewGradeSchema = z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']);

export const reviewCardSchema = z.object({
  questionId: z.string(),
  prompt: z.string(),
  type: z.string(),
  /** Đáp án đúng dạng chữ để hiện ở mặt sau thẻ. */
  answerText: z.string(),
  explanation: z.string().nullable(),
  courseId: z.string(),
  courseTitle: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  dueAt: z.string(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
});

export const dueReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const dueReviewsResponseSchema = z.object({
  cards: z.array(reviewCardSchema),
  dueCount: z.number().int(),
  /** Thẻ gần nhất chưa đến hạn; `null` khi không còn thẻ nào. */
  nextDueAt: z.string().nullable(),
});

export const submitReviewSchema = z
  .object({
    grade: reviewGradeSchema,
    /** Lúc người dùng chấm trên máy (có thể là lúc offline); server kẹp về khoảng hợp lệ. */
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const reviewResultSchema = z.object({
  questionId: z.string(),
  dueAt: z.string(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  easeFactor: z.number(),
  /** `false` khi lượt chấm cũ hơn lượt đã áp dụng: chỉ lưu lịch sử, không đổi lịch. */
  applied: z.boolean(),
});

/** Màn "Ôn tập": một hàng đợi chung cho câu hỏi bài tập và flashcard, server trộn theo `dueAt`. */
export const REVIEW_QUEUE_LIMIT = 20;

export const reviewQueueItemSchema = z.discriminatedUnion('kind', [
  reviewCardSchema.extend({ kind: z.literal('question') }),
  z.object({
    kind: z.literal('flashcard'),
    id: z.string(),
    deckId: z.string(),
    deckTitle: z.string(),
    front: z.string(),
    back: z.string(),
    dueAt: z.string(),
  }),
]);

export const reviewQueueResponseSchema = z.object({
  items: z.array(reviewQueueItemSchema),
  /** Tổng thẻ đến hạn của cả hai nguồn (có thể lớn hơn `items.length`). */
  dueCount: z.number().int(),
  nextDueAt: z.string().nullable(),
});

export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;
export type ReviewGrade = z.infer<typeof reviewGradeSchema>;
export type ReviewCard = z.infer<typeof reviewCardSchema>;
export type DueReviewsQuery = z.infer<typeof dueReviewsQuerySchema>;
export type DueReviewsResponse = z.infer<typeof dueReviewsResponseSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
