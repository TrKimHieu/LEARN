import type { ReviewGrade } from '@learn/contracts';
import { sm2, type Sm2State } from './sm2';

const DAY_MS = 86_400_000;

export interface ReviewableCard extends Sm2State {
  dueAt: Date;
  lastReviewedAt: Date | null;
  createdAt: Date;
}

export interface ReviewOutcome {
  /** `false` khi lượt chấm cũ hơn lượt đã áp dụng: chỉ lưu lịch sử, lịch giữ nguyên. */
  applied: boolean;
  /** Giờ chấm đã kẹp về khoảng hợp lệ. */
  reviewedAt: Date;
  state: Sm2State;
  dueAt: Date;
}

/**
 * Một lượt chấm thẻ, dùng chung cho ôn câu hỏi bài tập và ôn Thẻ. Giờ client không đáng tin: không
 * vượt quá giờ server; thẻ chưa chấm lần nào thì không sớm hơn lúc thẻ được tạo. Cũ hơn lượt đã áp
 * dụng thì không đổi lịch.
 */
export function reviewCard(
  card: ReviewableCard,
  grade: ReviewGrade,
  claimedAt: Date,
  now: Date,
): ReviewOutcome {
  const capped = claimedAt.getTime() > now.getTime() ? now : claimedAt;
  const last = card.lastReviewedAt;
  const stale = last !== null && capped.getTime() < last.getTime();
  const reviewedAt = last ? capped : new Date(Math.max(capped.getTime(), card.createdAt.getTime()));

  if (stale) {
    return {
      applied: false,
      reviewedAt,
      state: {
        easeFactor: card.easeFactor,
        intervalDays: card.intervalDays,
        repetitions: card.repetitions,
        lapses: card.lapses,
      },
      dueAt: card.dueAt,
    };
  }
  const state = sm2(card, grade);
  return {
    applied: true,
    reviewedAt,
    state,
    dueAt: new Date(reviewedAt.getTime() + state.intervalDays * DAY_MS),
  };
}
