import { Injectable } from '@nestjs/common';
import { newId } from '@learn/db';
import { PrismaService } from '../../../infra/services';

/** Lọc chủ sở hữu và `deletedAt` ngay trong truy vấn, như các domain khác (chống IDOR). */
@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  lessonOwnedBy(userId: string, lessonId: string) {
    return this.prisma.client.lesson.findFirst({
      where: { id: lessonId, deletedAt: null, course: { ownerId: userId, deletedAt: null } },
      select: { id: true },
    });
  }

  courseOwnedBy(userId: string, courseId: string) {
    return this.prisma.client.course.findFirst({
      where: { id: courseId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
  }

  async create(
    rows: Array<{
      userId: string;
      topic: string;
      question: string;
      score: number;
      subjectId: string | null;
      comment: string | null;
    }>,
  ): Promise<number> {
    const res = await this.prisma.client.feedback.createMany({
      data: rows.map((r) => ({ id: newId(), ...r })),
    });
    return res.count;
  }

  /** Số lượt theo (chủ đề, câu hỏi, điểm); trung bình và phân bố tính từ đây. */
  countsByScore() {
    return this.prisma.client.feedback.groupBy({
      by: ['topic', 'question', 'score'],
      _count: { _all: true },
    });
  }

  recentComments(limit: number) {
    return this.prisma.client.feedback.findMany({
      where: { comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { topic: true, score: true, comment: true, createdAt: true },
    });
  }
}
