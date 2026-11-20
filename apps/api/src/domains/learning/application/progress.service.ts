import { Injectable } from '@nestjs/common';
import type {
  ProgressOverview,
  ProgressCourse,
  HistoryPage,
  CourseProgress,
} from '@learn/contracts';
import { ApiError } from '../../../core/exceptions/errors';
import { env } from '../../../environment';
import { CourseRepository } from '../../courses/infrastructure/repositories/course.repository';
import { LessonRepository } from '../infrastructure/repositories/lesson.repository';
import { LearningProgressRepository } from '../infrastructure/repositories/learning-progress.repository';
import { SubmissionRepository } from '../infrastructure/repositories/submission.repository';
import { XpService } from '../../gamification/application/xp.service';
import { localDayKey, previousDayKey, utcDayKey } from './day-key';

/**
 * Chuỗi ngày học liên tiếp chỉ cần nhìn lại tối đa ngần này ngày. Chuỗi dài hơn 1 năm
 * không phải thứ sản phẩm này hứa, và đây là cận trên cứng cho khối lượng dữ liệu đọc lên.
 */
const STREAK_LOOKBACK_DAYS = 366;

const DAY_MS = 86_400_000;

@Injectable()
export class ProgressService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly lessons: LessonRepository,
    private readonly progress: LearningProgressRepository,
    private readonly submissions: SubmissionRepository,
    private readonly xp: XpService,
  ) {}

  async overview(userId: string): Promise<ProgressOverview> {
    const [courseCount, totalLessons, completedLessons, scores, study, xp] = await Promise.all([
      this.courses.countOwned(userId),
      this.lessons.countForOwner(userId),
      this.progress.countCompleted(userId),
      // score trong Submission là điểm % (0-100) đã chia tỷ lệ khi nộp bài (xem exercises.service).
      // Trung bình tính bằng `aggregate` trong Postgres; bản trước kéo TOÀN BỘ Submission của
      // người dùng về Node chỉ để cộng lại — không giới hạn, lớn dần mãi theo thời gian dùng.
      this.submissions.averageForUser(userId),
      this.studyDays(userId),
      this.xp.summary(userId),
    ]);

    return {
      courseCount,
      totalLessons,
      completedLessons,
      averageScore: scores._avg.score == null ? null : Math.round(scores._avg.score * 10) / 10,
      activeStreak: study.streak,
      lastStudyDay: study.lastStudyDay,
      ...xp,
    };
  }

  async perCourse(userId: string): Promise<{ courses: ProgressCourse[] }> {
    const courses = await this.courses.findManyWithLessonCount(userId);
    const rows = await this.progress.completedByCourse(userId);
    const doneMap = new Map(rows.map((r) => [r.courseId, r._count._all]));

    return {
      courses: courses.map((c) => {
        const total = c._count.lessons;
        const completed = doneMap.get(c.id) ?? 0;
        return {
          courseId: c.id,
          courseTitle: c.title,
          completed,
          total,
          // Khoá học chưa có bài học nào: 0/0 là 0%, không phải chia cho 0. Bản trước dùng
          // `Math.max(total, 1)` nên màn hình hiện "0/1" cho khoá học rỗng.
          percent: total === 0 ? 0 : Math.round((completed / total) * 100),
        };
      }),
    };
  }

  async history(userId: string, limit = 20, cursor?: string): Promise<HistoryPage> {
    // Lấy dư một dòng để biết còn trang sau hay không mà không cần COUNT.
    const rows = await this.submissions.page(userId, limit + 1, cursor);
    const hasMore = rows.length > limit;
    const subs = hasMore ? rows.slice(0, limit) : rows;
    return {
      nextCursor: hasMore ? (subs.at(-1)?.id ?? null) : null,
      items: subs.map((s) => ({
        id: s.id,
        courseId: s.exercise.lesson.course.id,
        lessonId: s.exercise.lesson.id,
        exerciseId: s.exerciseId,
        passed: s.score >= s.exercise.passScore,
        lessonTitle: s.exercise.lesson.title,
        courseTitle: s.exercise.lesson.course.title,
        exerciseTitle: s.exercise.title,
        score: s.score,
        maxScore: s.maxScore,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  async courseProgress(userId: string, courseId: string): Promise<CourseProgress> {
    const course = await this.courses.findOwned(courseId, userId);
    if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');

    const [lessons, progress] = await Promise.all([
      this.lessons.listLightForCourse(course.id),
      this.progress.findForCourse(userId, course.id),
    ]);

    const map = new Map(progress.map((p) => [p.lessonId, p]));
    return {
      lessons: lessons.map((l) => {
        const p = map.get(l.id);
        return {
          lessonId: l.id,
          lessonTitle: l.title,
          orderIndex: l.orderIndex,
          status: p?.status ?? 'NOT_STARTED',
          bestScore: p?.bestScore ?? null,
        };
      }),
    };
  }

  /**
   * Ngày học = có nộp bài hoặc ôn thẻ/câu hỏi. Trả số ngày liên tiếp tính tới hôm nay (hoặc hôm qua, nếu hôm nay chưa học).
   *
   * Hai điều đáng chú ý:
   *
   * 1. Bản gốc dùng `findMany({ distinct: ['createdAt'] })`. `createdAt` là timestamp độ phân
   *    giải mili-giây nên gần như mọi dòng đều "distinct" — câu đó thực chất tải **toàn bộ**
   *    lượt nộp của người dùng về Node, không `take`, chỉ để rút ra một tập ngày. Nay gom ngày
   *    ngay trong Postgres và chặn cửa sổ nhìn lại.
   *
   * 2. Ngày cắt theo `APP_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`), không theo UTC. Cột
   *    `createdAt` là `TIMESTAMP(3)` **không** mang múi giờ và Prisma ghi giá trị UTC vào đó,
   *    nên phải nói rõ cả hai bước: `AT TIME ZONE 'UTC'` để gán ý nghĩa cho con số, rồi
   *    `AT TIME ZONE <tz>` để đổi sang giờ địa phương. Thiếu bước đầu thì kết quả phụ thuộc
   *    biến `TimeZone` của phiên Postgres — chạy máy khác ra số khác.
   */
  private async studyDays(
    userId: string,
  ): Promise<{ streak: number; lastStudyDay: string | null }> {
    const tz = env.APP_TIMEZONE;
    const since = new Date(Date.now() - STREAK_LOOKBACK_DAYS * DAY_MS);
    const rows = await this.submissions.distinctStudyDays(userId, since, tz, STREAK_LOOKBACK_DAYS);
    if (rows.length === 0) return { streak: 0, lastStudyDay: null };

    // `date_trunc` trả `timestamp` không múi giờ, mang đúng ngày địa phương; Prisma dựng Date
    // coi nó là UTC, nên đọc lại bằng các getter UTC là ra đúng ngày ấy.
    const days = new Set(rows.map((r) => utcDayKey(r.day)));
    const lastStudyDay = utcDayKey(rows[0]!.day);

    let cursor = localDayKey(new Date(), tz);
    // Chưa học hôm nay thì chuỗi vẫn còn sống nếu hôm qua có học.
    if (!days.has(cursor)) cursor = previousDayKey(cursor);
    if (!days.has(cursor)) return { streak: 0, lastStudyDay };

    let streak = 0;
    while (days.has(cursor)) {
      streak += 1;
      cursor = previousDayKey(cursor);
    }
    return { streak, lastStudyDay };
  }
}

// Giữ đường import cũ (test, integration) sau khi tách hàm ngày sang `day-key.ts`.
export { localDayKey, previousDayKey, utcDayKey } from './day-key';
