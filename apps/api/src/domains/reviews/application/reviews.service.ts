import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@learn/db';
import type {
  DueReviewsResponse,
  ReviewCard,
  ReviewResult,
  SubmitReviewInput,
} from '@learn/contracts';
import { ApiError } from '../../../core/exceptions/errors';
import { PrismaService } from '../../../infra/services';
import { idempotencyKeyReused, isIdempotencyKeyViolation } from '../../../core/srs/idempotency';
import { ReviewRepository } from '../infrastructure/review.repository';
import { reviewCard } from '../../../core/srs/review';
import { XpService } from '../../gamification/application/xp.service';
import { REVIEW_XP } from '../../gamification/application/xp-rules';

const DAY_MS = 86_400_000;

/** Thẻ đã đúng ở lượt nộp gần nhất thì ôn lần đầu sau 1 ngày. */
const FIRST_DUE_IF_CORRECT_MS = DAY_MS;

interface AnswerSource {
  type: string;
  correctAnswer: unknown;
  options: Array<{ content: string; isCorrect: boolean }>;
}

/**
 * Đáp án đúng dạng chữ cho mặt sau thẻ. Trắc nghiệm lấy từ `AnswerOption.isCorrect` (nguồn dùng
 * để chấm, xem `publicCorrectAnswer` ở exercises.service), không tin `correctAnswer` của câu trắc nghiệm.
 */
export function answerTextOf(q: AnswerSource): string {
  const correct = (q.correctAnswer ?? {}) as { value?: boolean; acceptable?: unknown };
  switch (q.type) {
    case 'MULTIPLE_CHOICE':
      return q.options.find((o) => o.isCorrect)?.content ?? '';
    case 'TRUE_FALSE':
      return correct.value === true ? 'Đúng' : 'Sai';
    default: {
      const first = Array.isArray(correct.acceptable) ? correct.acceptable[0] : undefined;
      return typeof first === 'string' ? first : '';
    }
  }
}

/** Dấu vân tay body, để cùng key nhưng khác thẻ/mức chấm/giờ chấm thì trả 409. */
function reviewFingerprint(questionId: string, input: SubmitReviewInput): string {
  return createHash('sha256')
    .update(JSON.stringify([questionId, input.grade, input.reviewedAt]))
    .digest('hex');
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewRepository,
    private readonly xp: XpService,
  ) {}

  /** Sinh lịch cho câu hỏi đã nộp mà chưa có thẻ, rồi trả các thẻ đến hạn (gần hạn nhất trước). */
  async due(userId: string, limit: number): Promise<DueReviewsResponse> {
    const now = new Date();
    const seeds = await this.reviews.findSeeds(userId);
    await this.reviews.createSchedules(
      seeds.map((s) => ({
        userId,
        questionId: s.questionId,
        dueAt: s.isCorrect ? new Date(now.getTime() + FIRST_DUE_IF_CORRECT_MS) : now,
      })),
    );

    const [rows, dueCount, nextDueAt] = await Promise.all([
      this.reviews.listDue(userId, now, limit),
      this.reviews.countDue(userId, now),
      this.reviews.nextDueAt(userId, now),
    ]);

    const cards: ReviewCard[] = rows.map((r) => ({
      questionId: r.questionId,
      prompt: r.question.prompt,
      type: r.question.type,
      answerText: answerTextOf(r.question),
      explanation: r.question.explanation,
      courseId: r.question.exercise.lesson.course.id,
      courseTitle: r.question.exercise.lesson.course.title,
      lessonId: r.question.exercise.lesson.id,
      lessonTitle: r.question.exercise.lesson.title,
      dueAt: r.dueAt.toISOString(),
      intervalDays: r.intervalDays,
      repetitions: r.repetitions,
    }));
    return { cards, dueCount, nextDueAt: nextDueAt ? nextDueAt.toISOString() : null };
  }

  /**
   * Áp một lượt chấm. `idempotencyKey` (header `Idempotency-Key`): cùng người dùng + cùng key trả
   * lại đúng kết quả lần đầu; cùng key nhưng nội dung khác → 409. Kết quả lưu cùng transaction
   * với `CardReview`.
   */
  async review(
    userId: string,
    questionId: string,
    input: SubmitReviewInput,
    idempotencyKey: string | null,
  ): Promise<ReviewResult> {
    const requestHash = idempotencyKey ? reviewFingerprint(questionId, input) : null;
    if (idempotencyKey && requestHash) {
      const prior = await this.replay(userId, idempotencyKey, requestHash);
      if (prior) return prior;
    }

    if (!(await this.reviews.findSchedule(userId, questionId))) {
      throw ApiError.notFound('Không tìm thấy thẻ ôn tập.');
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const card = await this.reviews.lockSchedule(tx, userId, questionId);
        if (!card) throw ApiError.notFound('Không tìm thấy thẻ ôn tập.');

        const outcome = reviewCard(card, input.grade, new Date(input.reviewedAt), new Date());
        if (outcome.applied) {
          await this.reviews.updateSchedule(tx, card.id, {
            ...outcome.state,
            dueAt: outcome.dueAt,
            lastReviewedAt: outcome.reviewedAt,
          });
        }
        const result: ReviewResult = {
          questionId,
          dueAt: outcome.dueAt.toISOString(),
          intervalDays: outcome.state.intervalDays,
          repetitions: outcome.state.repetitions,
          easeFactor: outcome.state.easeFactor,
          applied: outcome.applied,
        };

        await this.reviews.createReview(tx, {
          userId,
          questionId,
          grade: input.grade,
          reviewedAt: outcome.reviewedAt,
          idempotencyKey,
          requestHash,
          response: result as unknown as Prisma.InputJsonValue,
        });
        // Lượt chấm cũ hơn lần cuối không đổi lịch, cũng không cộng XP.
        if (outcome.applied) {
          await this.xp.award(tx, { userId, source: 'CARD_REVIEW', refId: questionId, amount: REVIEW_XP });
        }
        return result;
      });
    } catch (e) {
      // Lượt song song cùng key đã ghi trước: trả kết quả của lượt đó thay vì lỗi.
      if (idempotencyKey && requestHash && isIdempotencyKeyViolation(e)) {
        const prior = await this.replay(userId, idempotencyKey, requestHash);
        if (prior) return prior;
      }
      throw e;
    }
  }

  /** Kết quả đã lưu của lượt chấm cùng key; `null` khi chưa có. Khác nội dung → 409. */
  private async replay(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<ReviewResult | null> {
    const prior = await this.reviews.findReviewByKey(userId, key);
    if (!prior) return null;
    if (prior.requestHash !== requestHash || !prior.response) throw idempotencyKeyReused();
    return prior.response as unknown as ReviewResult;
  }
}
