import { Injectable, Logger } from '@nestjs/common';
import { prisma, newId, Prisma } from '@learn/db';
import {
  FLASHCARD_PROMPT_VERSION,
  extractJson,
  flashcardPrompt,
  validateFlashcardOutput,
  type FlashcardDraftCard,
  type LlmProvider,
} from '@learn/ai';
import { RedisPublisher } from '../common/redis';
import { createLlmProvider, estimateCostUsd } from '../common/llm';
import { env } from '../environment';
import { JobCancelledError, JobError } from './job-errors';

export interface FlashcardGenerateJobData {
  aiJobId: string;
  courseId: string;
  userId: string;
  params: {
    lessonId: string | null;
    documentId: string | null;
    count: number;
    language: 'vi' | 'en';
  };
}

/** Số lần gọi tối đa khi đầu ra chưa dùng được (lần đầu + các lần sửa theo lý do). */
const MAX_ATTEMPTS = 3;
/** Giới hạn độ dài nguồn gửi cho mô hình, để một tài liệu dài không làm vượt ngữ cảnh. */
const MAX_SOURCE_CHARS = 12_000;

/**
 * Sinh Thẻ nháp từ một bài học hoặc tài liệu đã trích xuất. Nháp lưu ở `FlashcardDraft`, chưa có lịch
 * ôn: người học duyệt rồi mới chấp nhận thành `Flashcard`. Cùng khuôn với `LessonGenerateProcessor`
 * (claim QUEUED→RUNNING, kiểm tra huỷ, hạn chót, ghi `GenerationRun`, chốt trạng thái nguyên tử).
 */
@Injectable()
export class FlashcardGenerateProcessor {
  private readonly logger = new Logger(FlashcardGenerateProcessor.name);
  private readonly llm: LlmProvider = createLlmProvider();

  constructor(private readonly redis: RedisPublisher) {}

  async process(data: FlashcardGenerateJobData): Promise<void> {
    const { aiJobId, courseId, params } = data;
    const job = await prisma.aIJob.findUnique({ where: { id: aiJobId } });
    // Chủ của thẻ nháp lấy từ AIJob, không tin payload hàng đợi.
    const userId = job?.requestedById ?? '';
    if (!job || job.status !== 'QUEUED') {
      this.logger.log(
        `AIJob ${aiJobId} ${job ? `status=${job.status}` : 'không tồn tại'}, bỏ qua.`,
      );
      return;
    }
    const claimed = await prisma.aIJob.updateMany({
      where: { id: aiJobId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date(), attempt: { increment: 1 } },
    });
    if (claimed.count === 0) return; // worker khác đã nhận

    const deadline = Date.now() + env.AI_JOB_TIMEOUT_MS;
    let costSoFar = 0;

    try {
      await this.publish(aiJobId, {
        status: 'RUNNING',
        progress: 10,
        label: 'Đang đọc nội dung nguồn',
      });
      await this.assertNotCancelled(aiJobId);
      const source = await this.loadSource(courseId, params);

      await this.publish(aiJobId, { status: 'RUNNING', progress: 35, label: 'Đang sinh thẻ' });
      let cards: FlashcardDraftCard[] | null = null;
      let previousError: string | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cards; attempt++) {
        await this.assertNotCancelled(aiJobId);
        if (Date.now() > deadline) {
          throw new JobError('JOB_TIMEOUT', 'Sinh thẻ quá thời gian cho phép.');
        }
        if (costSoFar > env.AI_JOB_MAX_COST_USD) {
          throw new JobError('COST_LIMIT_EXCEEDED', 'Job vượt ngân sách chi phí cho phép.');
        }

        const res = await this.callLlm(
          flashcardPrompt({
            language: params.language,
            title: source.title,
            count: params.count,
            text: source.text,
            previousError,
          }),
        );
        const cost = estimateCostUsd(res.model, res.inputTokens, res.outputTokens);
        costSoFar += cost;

        let checked;
        try {
          checked = validateFlashcardOutput(extractJson(res.text), params.count);
        } catch (e) {
          checked = {
            ok: false as const,
            errors: [e instanceof Error ? e.message : 'không đọc được JSON'],
          };
        }
        await this.recordRun(
          aiJobId,
          res,
          cost,
          attempt,
          checked.ok ? { dropped: checked.dropped } : checked,
        );
        if (checked.ok) cards = checked.cards;
        else previousError = checked.errors.join('; ');
      }
      if (!cards) {
        throw new JobError(
          'FLASHCARD_OUTPUT_INVALID',
          'Không sinh được thẻ hợp lệ từ nguồn này. Vui lòng thử lại hoặc chọn nguồn khác.',
          { lastError: previousError },
        );
      }

      await this.publish(aiJobId, { status: 'RUNNING', progress: 85, label: 'Đang lưu thẻ nháp' });
      await this.assertNotCancelled(aiJobId);
      if (!(await this.commit(aiJobId, userId, courseId, cards))) throw new JobCancelledError();
      await this.redis.publishJobEvent(aiJobId, {
        status: 'SUCCEEDED',
        progress: 100,
        label: 'Hoàn tất',
        draftCount: cards.length,
      });
    } catch (err) {
      await this.fail(aiJobId, err);
    }
  }

  /** Nội dung nguồn và tiêu đề: bài học chưa xóa của khóa học, hoặc các đoạn của tài liệu đã trích xuất. */
  private async loadSource(courseId: string, params: FlashcardGenerateJobData['params']) {
    let title = '';
    let text = '';
    if (params.lessonId) {
      const lesson = await prisma.lesson.findFirst({
        where: { id: params.lessonId, courseId, deletedAt: null },
      });
      title = lesson?.title ?? '';
      text = lesson?.contentMd ?? '';
    } else if (params.documentId) {
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId: params.documentId, document: { courseId, status: 'EXTRACTED' } },
        orderBy: { index: 'asc' },
        include: { document: { select: { filename: true } } },
      });
      title = chunks[0]?.document.filename ?? '';
      text = chunks.map((c) => c.content).join('\n\n');
    }
    text = text.trim().slice(0, MAX_SOURCE_CHARS);
    if (!text) {
      throw new JobError('NO_SOURCE_CONTENT', 'Nguồn đã chọn chưa có nội dung để sinh thẻ.');
    }
    return { title, text };
  }

  /** Chốt job SUCCEEDED và ghi thẻ nháp trong một transaction; job không còn RUNNING (đã huỷ) thì không ghi gì. */
  private commit(aiJobId: string, userId: string, courseId: string, cards: FlashcardDraftCard[]) {
    return prisma.$transaction(async (tx) => {
      const done = await tx.aIJob.updateMany({
        where: { id: aiJobId, status: 'RUNNING' },
        data: {
          status: 'SUCCEEDED',
          progress: 100,
          progressLabel: 'Hoàn tất',
          finishedAt: new Date(),
        },
      });
      if (done.count === 0) return false;
      await tx.flashcardDraft.createMany({
        data: cards.map((c) => ({
          id: newId(),
          userId,
          courseId,
          aiJobId,
          front: c.front,
          back: c.back,
        })),
      });
      return true;
    });
  }

  private callLlm(prompt: string) {
    return Promise.race([
      this.llm.generate({ prompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM call timeout (120s)')), 120_000),
      ),
    ]);
  }

  private async recordRun(
    aiJobId: string,
    res: { model: string; inputTokens: number; outputTokens: number; latencyMs: number },
    costUsd: number,
    attempt: number,
    validationReport: unknown,
  ): Promise<void> {
    await prisma.generationRun.create({
      data: {
        id: newId(),
        aiJobId,
        step: 'flashcards',
        model: res.model,
        promptVersion: FLASHCARD_PROMPT_VERSION,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: new Prisma.Decimal(costUsd.toFixed(6)),
        latencyMs: res.latencyMs,
        attempt,
        validationReport: validationReport as never,
      },
    });
  }

  private async publish(aiJobId: string, event: Record<string, unknown>): Promise<void> {
    await prisma.aIJob.updateMany({
      where: { id: aiJobId, status: { in: ['RUNNING', 'QUEUED'] } },
      data: {
        progress: (event.progress as number) ?? undefined,
        progressLabel: (event.label as string) ?? undefined,
      },
    });
    await this.redis.publishJobEvent(aiJobId, event);
  }

  private async assertNotCancelled(aiJobId: string): Promise<void> {
    const row = await prisma.aIJob.findUnique({ where: { id: aiJobId }, select: { status: true } });
    if (row?.status === 'CANCELLED') throw new JobCancelledError();
  }

  private async fail(aiJobId: string, err: unknown): Promise<void> {
    if (err instanceof JobCancelledError) {
      const cancelled = await prisma.aIJob.updateMany({
        where: { id: aiJobId, status: 'CANCELLED' },
        data: { finishedAt: new Date() },
      });
      if (cancelled.count === 0) return;
      await this.redis.publishJobEvent(aiJobId, {
        status: 'CANCELLED',
        code: 'CANCELLED_BY_USER',
        message: 'Job đã được huỷ.',
      });
      return;
    }
    const jobErr =
      err instanceof JobError
        ? err
        : new JobError('AI_GENERATION_FAILED', err instanceof Error ? err.message : String(err));
    const failed = await prisma.aIJob.updateMany({
      where: { id: aiJobId, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        error: {
          code: jobErr.code,
          message: jobErr.message,
          detail: jobErr.detail ?? null,
        } as never,
      },
    });
    if (failed.count === 0) {
      const current = await prisma.aIJob.findUnique({
        where: { id: aiJobId },
        select: { status: true },
      });
      if (current?.status === 'CANCELLED') await this.fail(aiJobId, new JobCancelledError());
      return;
    }
    await this.redis.publishJobEvent(aiJobId, {
      status: 'FAILED',
      code: jobErr.code,
      message: jobErr.message,
    });
    this.logger.error(`AIJob ${aiJobId} FAILED [${jobErr.code}]: ${jobErr.message}`);
  }
}
