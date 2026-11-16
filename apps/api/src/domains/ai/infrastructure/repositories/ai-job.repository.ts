import { Injectable } from '@nestjs/common';
import { newId } from '@learn/db';
import { PrismaService, type Db } from '../../../../infra/services';
import { env } from '../../../../environment';

export type AIJobTypeName =
  'EXTRACT_DOCUMENT' | 'GENERATE_LESSONS' | 'REGENERATE_LESSON' | 'GENERATE_FLASHCARDS';

@Injectable()
export class AIJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Job thuộc người dùng — lọc `requestedById` tại truy vấn (chống IDOR). */
  findOwned(id: string, userId: string, db: Db = this.prisma.client) {
    return db.aIJob.findFirst({ where: { id, requestedById: userId } });
  }

  /** Chỉ kiểm tra tồn tại + quyền — không kéo toàn bộ payload. */
  existsOwned(id: string, userId: string, db: Db = this.prisma.client) {
    return db.aIJob.findFirst({
      where: { id, requestedById: userId },
      select: { id: true },
    });
  }

  /** Job sinh nội dung đang chạy cho (course, type, params) — chống nộp trùng khi tạo. */
  findPendingGenerate(
    courseId: string,
    userId: string,
    params: Record<string, unknown>,
    db: Db = this.prisma.client,
    type: AIJobTypeName = 'GENERATE_LESSONS',
  ) {
    return db.aIJob.findFirst({
      where: {
        courseId,
        requestedById: userId,
        type,
        status: { in: ['QUEUED', 'RUNNING'] },
        inputParams: { equals: params as never },
        // Worker chết giữa chừng để lại job RUNNING mãi; quá hai lần hạn chót thì không coi là còn chạy,
        // nếu không người dùng không bao giờ sinh lại được với cùng tham số.
        queuedAt: { gte: new Date(Date.now() - 2 * env.AI_JOB_TIMEOUT_MS) },
      },
    });
  }

  create(
    data: {
      courseId: string;
      requestedById: string;
      type: AIJobTypeName;
      documentId?: string | null;
      idempotencyKey: string;
      params: Record<string, unknown>;
      queuedAt: Date;
    },
    db: Db,
  ) {
    return db.aIJob.create({
      data: {
        id: newId(),
        courseId: data.courseId,
        requestedById: data.requestedById,
        type: data.type,
        documentId: data.documentId ?? null,
        idempotencyKey: data.idempotencyKey,
        inputParams: data.params as never,
        queuedAt: data.queuedAt,
      },
    });
  }

  /** Bài học chưa xóa thuộc đúng khóa học (khóa học đã được kiểm chủ sở hữu ở service). */
  lessonInCourse(lessonId: string, courseId: string, db: Db = this.prisma.client) {
    return db.lesson.findFirst({
      where: { id: lessonId, courseId, deletedAt: null },
      select: { id: true },
    });
  }

  listOwned(userId: string, courseId?: string, db: Db = this.prisma.client) {
    return db.aIJob.findMany({
      where: { requestedById: userId, ...(courseId ? { courseId } : {}) },
      orderBy: { queuedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Huỷ job đang QUEUED/RUNNING — MỘT câu UPDATE có điều kiện. Lọc `requestedById` trong `where`
   * nên vẫn chống IDOR; trả `null` khi không có dòng nào khớp (không tồn tại / sai trạng thái).
   */
  cancelIfQueuedOrRunning(id: string, userId: string, db: Db = this.prisma.client) {
    return db.aIJob
      .update({
        where: { id, requestedById: userId, status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'CANCELLED' },
      })
      .catch(() => null);
  }
}
