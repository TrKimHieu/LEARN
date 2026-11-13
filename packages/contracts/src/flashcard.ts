import { z } from 'zod';
import { reviewGradeSchema } from './review';

/**
 * Thẻ và Bộ thẻ do người học tự quản lý (GLOSSARY.md). Tách biệt với ôn câu hỏi bài tập (`review.ts`):
 * thẻ có mặt trước/mặt sau tự nhập và lịch ôn SM-2 riêng.
 */

// Message tiếng Việt: hiển thị thẳng ở form.
const deckTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Vui lòng nhập tên bộ thẻ.' })
  .max(100, { message: 'Tên bộ thẻ tối đa 100 ký tự.' });
const cardFrontSchema = z
  .string()
  .trim()
  .min(1, { message: 'Vui lòng nhập mặt trước của thẻ.' })
  .max(500, { message: 'Mặt trước tối đa 500 ký tự.' });
const cardBackSchema = z
  .string()
  .trim()
  .min(1, { message: 'Vui lòng nhập mặt sau của thẻ.' })
  .max(1000, { message: 'Mặt sau tối đa 1000 ký tự.' });

export const createDeckSchema = z
  .object({ title: deckTitleSchema, courseId: z.string().uuid().nullable().optional() })
  .strict();

export const patchDeckSchema = z
  .object({ title: deckTitleSchema.optional(), courseId: z.string().uuid().nullable().optional() })
  .strict();

export const createFlashcardSchema = z
  .object({ front: cardFrontSchema, back: cardBackSchema })
  .strict();

/** `deckId` chuyển thẻ sang bộ khác (giữ nguyên lịch ôn). */
export const patchFlashcardSchema = z
  .object({
    front: cardFrontSchema.optional(),
    back: cardBackSchema.optional(),
    deckId: z.string().uuid().optional(),
  })
  .strict();

export const deckSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  courseId: z.string().nullable(),
  /** Tổng số thẻ trong bộ. */
  cardCount: z.number().int(),
  /** Thẻ chưa ôn lần nào. */
  newCount: z.number().int(),
  /** Thẻ đã ôn ít nhất một lần. */
  learningCount: z.number().int(),
  /** Thẻ có ngày ôn kế tiếp đã tới hoặc đã qua (gồm cả thẻ mới). */
  dueCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const flashcardSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  front: z.string(),
  back: z.string(),
  dueAt: z.string(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  lastReviewedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const deckListResponseSchema = z.object({ decks: z.array(deckSummarySchema) });
export const deckDetailResponseSchema = z.object({
  deck: deckSummarySchema,
  cards: z.array(flashcardSchema),
});

export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type PatchDeckInput = z.infer<typeof patchDeckSchema>;
export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
export type PatchFlashcardInput = z.infer<typeof patchFlashcardSchema>;
export type DeckSummary = z.infer<typeof deckSummarySchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type DeckListResponse = z.infer<typeof deckListResponseSchema>;
export type DeckDetailResponse = z.infer<typeof deckDetailResponseSchema>;

// Ôn Thẻ: cùng bốn mức nhớ và quy tắc kẹp giờ với ôn câu hỏi bài tập (`review.ts`).
export const dueFlashcardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const dueFlashcardSchema = flashcardSchema.pick({
  id: true,
  deckId: true,
  front: true,
  back: true,
  dueAt: true,
  intervalDays: true,
  repetitions: true,
});

export const dueFlashcardsResponseSchema = z.object({
  cards: z.array(dueFlashcardSchema),
  /** Tổng số thẻ đến hạn trong phạm vi hỏi (không bị cắt bởi `limit`). */
  dueCount: z.number().int(),
  /** Thẻ gần nhất chưa đến hạn; `null` khi không còn thẻ nào. */
  nextDueAt: z.string().nullable(),
});

export const submitFlashcardReviewSchema = z
  .object({
    grade: reviewGradeSchema,
    /** Lúc người học chấm trên máy; server kẹp về khoảng hợp lệ. */
    reviewedAt: z.string().datetime(),
  })
  .strict();

export const flashcardReviewResultSchema = z.object({
  cardId: z.string(),
  dueAt: z.string(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  easeFactor: z.number(),
  /** `false` khi lượt chấm cũ hơn lượt đã áp dụng: chỉ lưu lịch sử, không đổi lịch. */
  applied: z.boolean(),
});

export type DueFlashcardsQuery = z.infer<typeof dueFlashcardsQuerySchema>;
export type DueFlashcard = z.infer<typeof dueFlashcardSchema>;
export type DueFlashcardsResponse = z.infer<typeof dueFlashcardsResponseSchema>;
export type SubmitFlashcardReviewInput = z.infer<typeof submitFlashcardReviewSchema>;
export type FlashcardReviewResult = z.infer<typeof flashcardReviewResultSchema>;
