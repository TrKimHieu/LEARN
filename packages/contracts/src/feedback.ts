import { z } from 'zod';

/**
 * Feedback của người học: vote nhanh 1–5 sau một trải nghiệm (học xong bài, sinh bài, ôn thẻ...).
 * Mỗi câu trả lời là một dòng chỉ-thêm, để theo dõi chất lượng theo thời gian.
 */
export const feedbackTopicSchema = z.enum([
  /** Một bài học: chất lượng nội dung và mức nắm bài (`subjectId` = lessonId). */
  'LESSON',
  /** Bài kiểm tra/luyện tập của một bài học (`subjectId` = lessonId). */
  'PRACTICE',
  /** AI sinh bài học cho một khóa (`subjectId` = courseId). */
  'LESSON_GENERATION',
  'FLASHCARD_REVIEW',
  'FLASHCARD_AI',
  'POMODORO',
]);

export const feedbackQuestionSchema = z.enum(['QUALITY', 'UNDERSTANDING', 'USEFULNESS']);

export const feedbackAnswerSchema = z
  .object({ question: feedbackQuestionSchema, score: z.number().int().min(1).max(5) })
  .strict();

export const submitFeedbackSchema = z
  .object({
    topic: feedbackTopicSchema,
    answers: z.array(feedbackAnswerSchema).min(1).max(3),
    subjectId: z.string().uuid().optional(),
    comment: z.string().trim().max(500, { message: 'Góp ý tối đa 500 ký tự.' }).optional(),
  })
  .strict()
  .refine((v) => new Set(v.answers.map((a) => a.question)).size === v.answers.length, {
    message: 'Mỗi câu hỏi chỉ trả lời một lần.',
  });

export const feedbackStatSchema = z.object({
  topic: feedbackTopicSchema,
  question: feedbackQuestionSchema,
  count: z.number().int(),
  average: z.number(),
  /** Số lượt cho điểm 1..5, theo thứ tự. */
  distribution: z.array(z.number().int()).length(5),
});

export const feedbackCommentSchema = z.object({
  topic: feedbackTopicSchema,
  score: z.number().int(),
  comment: z.string(),
  createdAt: z.string(),
});

export const adminFeedbackSummarySchema = z.object({
  stats: z.array(feedbackStatSchema),
  /** Góp ý chữ gần nhất. */
  comments: z.array(feedbackCommentSchema),
});

export type FeedbackTopic = z.infer<typeof feedbackTopicSchema>;
export type FeedbackQuestion = z.infer<typeof feedbackQuestionSchema>;
export type FeedbackAnswer = z.infer<typeof feedbackAnswerSchema>;
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type FeedbackStat = z.infer<typeof feedbackStatSchema>;
export type AdminFeedbackSummary = z.infer<typeof adminFeedbackSummarySchema>;
