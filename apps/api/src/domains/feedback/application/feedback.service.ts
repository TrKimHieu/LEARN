import { Injectable } from '@nestjs/common';
import type {
  AdminFeedbackSummary,
  FeedbackQuestion,
  FeedbackTopic,
  SubmitFeedbackInput,
} from '@learn/contracts';
import { ApiError } from '../../../core/exceptions/errors';
import { FeedbackRepository } from '../infrastructure/feedback.repository';

/** Chủ đề nào gắn với đối tượng nào; chủ đề không có ở đây là feedback về cả một tính năng. */
const SUBJECT: Partial<Record<FeedbackTopic, 'lesson' | 'course'>> = {
  LESSON: 'lesson',
  PRACTICE: 'lesson',
  LESSON_GENERATION: 'course',
};

const RECENT_COMMENTS = 20;

@Injectable()
export class FeedbackService {
  constructor(private readonly repo: FeedbackRepository) {}

  async submit(userId: string, input: SubmitFeedbackInput): Promise<{ saved: number }> {
    const kind = SUBJECT[input.topic];
    if (!kind && input.subjectId) {
      throw ApiError.badRequest('Feedback về tính năng không gắn với đối tượng nào.');
    }
    if (kind && !input.subjectId) {
      throw ApiError.badRequest('Thiếu bài học hoặc khóa học được đánh giá.');
    }
    if (kind === 'lesson' && !(await this.repo.lessonOwnedBy(userId, input.subjectId!))) {
      throw ApiError.notFound('Không tìm thấy bài học.');
    }
    if (kind === 'course' && !(await this.repo.courseOwnedBy(userId, input.subjectId!))) {
      throw ApiError.notFound('Không tìm thấy khóa học.');
    }
    const comment = input.comment || null;
    const saved = await this.repo.create(
      input.answers.map((a, i) => ({
        userId,
        topic: input.topic,
        question: a.question,
        score: a.score,
        subjectId: input.subjectId ?? null,
        // Góp ý chữ là của cả lượt vote: lưu một lần, ở câu đầu tiên.
        comment: i === 0 ? comment : null,
      })),
    );
    return { saved };
  }

  async summary(): Promise<AdminFeedbackSummary> {
    const groups = new Map<string, { topic: string; question: string; dist: number[] }>();
    for (const g of await this.repo.countsByScore()) {
      const key = `${g.topic}/${g.question}`;
      const entry = groups.get(key) ?? {
        topic: g.topic,
        question: g.question,
        dist: [0, 0, 0, 0, 0],
      };
      if (g.score >= 1 && g.score <= 5) entry.dist[g.score - 1]! += g._count._all;
      groups.set(key, entry);
    }
    const stats = [...groups.values()]
      .map(({ topic, question, dist }) => {
        const count = dist.reduce((a, b) => a + b, 0);
        const sum = dist.reduce((a, n, i) => a + n * (i + 1), 0);
        return {
          topic: topic as FeedbackTopic,
          question: question as FeedbackQuestion,
          count,
          average: count ? Math.round((sum / count) * 100) / 100 : 0,
          distribution: dist,
        };
      })
      .sort((a, b) => a.topic.localeCompare(b.topic) || a.question.localeCompare(b.question));
    const comments = (await this.repo.recentComments(RECENT_COMMENTS)).map((c) => ({
      topic: c.topic as FeedbackTopic,
      score: c.score,
      comment: c.comment ?? '',
      createdAt: c.createdAt.toISOString(),
    }));
    return { stats, comments };
  }
}
