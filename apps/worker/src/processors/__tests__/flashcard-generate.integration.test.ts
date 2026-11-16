import { afterAll, describe, expect, it } from 'vitest';
import { prisma, newId } from '@learn/db';
import type { LlmGenerateParams, LlmGenerationResult, LlmProvider } from '@learn/ai';
import {
  FlashcardGenerateProcessor,
  type FlashcardGenerateJobData,
} from '../flashcard-generate.processor';
import { RedisPublisher } from '../../common/redis';

if (
  process.env.NODE_ENV !== 'test' ||
  process.env.DATABASE_URL !==
    'postgresql://learn_m1:learn_m1@127.0.0.1:15432/learn_m1?schema=public'
)
  throw Error('Fixed M1 sandbox required');

const SOURCE =
  'TCP là giao thức hướng kết nối. Nó đảm bảo dữ liệu đến đúng thứ tự. UDP không đảm bảo thứ tự. HTTP chạy trên TCP. DNS phân giải tên miền thành địa chỉ IP.';

const users: string[] = [];
const publishers: RecordingPublisher[] = [];

class RecordingPublisher extends RedisPublisher {
  readonly events: Record<string, unknown>[] = [];
  constructor() {
    super();
    publishers.push(this);
  }
  override async publishJobEvent(id: string, event: Record<string, unknown>) {
    this.events.push(event);
    await super.publishJobEvent(id, event);
  }
}

/** LLM giả: trả đúng chuỗi được định sẵn, và đếm số lần gọi. */
function stubLlm(
  reply: (call: number) => string,
  onCall?: () => Promise<void>,
): LlmProvider & {
  calls: number;
} {
  const llm = {
    calls: 0,
    defaultModel: 'stub/1',
    async generate(_params: LlmGenerateParams): Promise<LlmGenerationResult> {
      llm.calls++;
      await onCall?.();
      const text = reply(llm.calls);
      return { text, inputTokens: 10, outputTokens: 10, latencyMs: 1, model: 'stub/1' };
    },
  };
  return llm;
}

function processorWith(llm?: LlmProvider) {
  const publisher = new RecordingPublisher();
  const processor = new FlashcardGenerateProcessor(publisher);
  if (llm) (processor as unknown as { llm: LlmProvider }).llm = llm;
  return { processor, publisher };
}

async function fixture(source: 'lesson' | 'document', content = SOURCE, count = 3) {
  const user = await prisma.user.create({
    data: {
      email: `fc-gen-${newId()}@example.invalid`,
      passwordHash: 'test-only',
      displayName: 'Flashcard generation fixture',
    },
  });
  users.push(user.id);
  const course = await prisma.course.create({ data: { ownerId: user.id, title: 'Mạng' } });
  let lessonId: string | null = null;
  let documentId: string | null = null;
  if (source === 'lesson') {
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        orderIndex: 0,
        title: 'Giao thức vận chuyển',
        contentMd: content,
      },
    });
    lessonId = lesson.id;
  } else {
    const doc = await prisma.document.create({
      data: {
        courseId: course.id,
        uploaderId: user.id,
        filename: 'mang.md',
        mimeType: 'text/markdown',
        sizeBytes: 100,
        storageKey: newId(),
        checksumSha256: 'test',
        status: 'EXTRACTED',
      },
    });
    documentId = doc.id;
    if (content) {
      await prisma.documentChunk.create({
        data: { documentId: doc.id, index: 0, content, tokenCount: 50 },
      });
    }
  }
  const job = await prisma.aIJob.create({
    data: {
      courseId: course.id,
      requestedById: user.id,
      documentId,
      type: 'GENERATE_FLASHCARDS',
      idempotencyKey: `fc:${newId()}`,
      inputParams: { lessonId, documentId, count, language: 'vi' },
    },
  });
  const data: FlashcardGenerateJobData = {
    aiJobId: job.id,
    courseId: course.id,
    userId: user.id,
    params: { lessonId, documentId, count, language: 'vi' },
  };
  return { user, course, job, data };
}

const draftsOf = (aiJobId: string) => prisma.flashcardDraft.findMany({ where: { aiJobId } });
const jobOf = (id: string) => prisma.aIJob.findUniqueOrThrow({ where: { id } });

afterAll(async () => {
  for (const p of publishers) await p.onModuleDestroy();
  for (const id of users) {
    await prisma.flashcardDraft.deleteMany({ where: { userId: id } });
    await prisma.generationRun.deleteMany({ where: { aiJob: { requestedById: id } } });
    await prisma.aIJob.deleteMany({ where: { requestedById: id } });
    await prisma.documentChunk.deleteMany({ where: { document: { uploaderId: id } } });
    await prisma.document.deleteMany({ where: { uploaderId: id } });
    await prisma.lesson.deleteMany({ where: { course: { ownerId: id } } });
    await prisma.course.deleteMany({ where: { ownerId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
});

describe('Worker sinh Thẻ nháp', () => {
  it('từ một bài học: job SUCCEEDED, thẻ nháp của đúng người dùng, có lượt chạy và sự kiện hoàn tất', async () => {
    const { data, user, course } = await fixture('lesson');
    const { processor, publisher } = processorWith();
    await processor.process(data);

    const job = await jobOf(data.aiJobId);
    expect(job).toMatchObject({ status: 'SUCCEEDED', progress: 100 });
    const drafts = await draftsOf(data.aiJobId);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.length).toBeLessThanOrEqual(3);
    for (const d of drafts) {
      expect(d).toMatchObject({ userId: user.id, courseId: course.id });
      expect(d.front.length).toBeGreaterThan(0);
      expect(d.back.length).toBeGreaterThan(0);
    }
    expect(await prisma.generationRun.count({ where: { aiJobId: data.aiJobId } })).toBe(1);
    expect(publisher.events.at(-1)).toMatchObject({
      status: 'SUCCEEDED',
      draftCount: drafts.length,
    });
  });

  it('bài học markdown nhiều đoạn có tiêu đề: sinh đúng số thẻ, mỗi thẻ một câu', async () => {
    const md = [
      '# Giao thức UDP',
      'Nội dung rút gọn từ tài liệu để chạy đầu-cuối.',
      '## Giao thức UDP',
      'UDP không kết nối, nhanh hơn TCP nhưng không bảo đảm đến đích.',
      'UDP phù hợp cho truyền phát thời gian thực và DNS.',
      'Gói UDP có thể mất hoặc đến sai thứ tự.',
    ].join('\n\n');
    const { data } = await fixture('lesson', md, 3);
    await processorWith().processor.process(data);
    expect(await jobOf(data.aiJobId)).toMatchObject({ status: 'SUCCEEDED' });
    const drafts = await draftsOf(data.aiJobId);
    expect(drafts).toHaveLength(3);
    for (const d of drafts) expect(d.back.length).toBeLessThan(md.length / 2);
  });

  it('từ một tài liệu đã trích xuất: sinh thẻ từ các đoạn của tài liệu', async () => {
    const { data } = await fixture('document');
    await processorWith().processor.process(data);
    expect(await jobOf(data.aiJobId)).toMatchObject({ status: 'SUCCEEDED' });
    expect((await draftsOf(data.aiJobId)).length).toBeGreaterThanOrEqual(1);
  });

  it('thẻ sai bị loại, thẻ đúng vẫn được lưu', async () => {
    const { data } = await fixture('lesson');
    const llm = stubLlm(() =>
      JSON.stringify({
        cards: [
          { front: 'Hợp lệ 1', back: 'Đáp 1' },
          { front: '', back: 'Mặt trước trống' },
          { front: 'Hợp lệ 2', back: 'Đáp 2' },
        ],
      }),
    );
    await processorWith(llm).processor.process(data);
    expect(await jobOf(data.aiJobId)).toMatchObject({ status: 'SUCCEEDED' });
    expect((await draftsOf(data.aiJobId)).map((d) => d.front).sort()).toEqual([
      'Hợp lệ 1',
      'Hợp lệ 2',
    ]);
  });

  it('đầu ra không dùng được sau các lần thử: job FAILED, không để lại thẻ nháp', async () => {
    const { data } = await fixture('lesson');
    const llm = stubLlm(() => 'xin lỗi, tôi không làm được');
    await processorWith(llm).processor.process(data);

    const job = await jobOf(data.aiJobId);
    expect(job.status).toBe('FAILED');
    expect(job.error).toMatchObject({ code: 'FLASHCARD_OUTPUT_INVALID' });
    expect(llm.calls).toBeGreaterThan(1);
    expect(await draftsOf(data.aiJobId)).toHaveLength(0);
  });

  it('lần đầu sai nhưng lần thử sau đúng: job vẫn thành công', async () => {
    const { data } = await fixture('lesson');
    const llm = stubLlm((call) =>
      call === 1 ? 'không phải JSON' : JSON.stringify({ cards: [{ front: 'Q', back: 'A' }] }),
    );
    await processorWith(llm).processor.process(data);
    expect(await jobOf(data.aiJobId)).toMatchObject({ status: 'SUCCEEDED' });
    expect(await draftsOf(data.aiJobId)).toHaveLength(1);
  });

  it('nguồn rỗng: job FAILED với mã rõ ràng và không gọi LLM', async () => {
    const { data } = await fixture('document', '');
    const llm = stubLlm(() => '{}');
    await processorWith(llm).processor.process(data);
    expect((await jobOf(data.aiJobId)).error).toMatchObject({ code: 'NO_SOURCE_CONTENT' });
    expect(llm.calls).toBe(0);
  });

  it('job đã huỷ trước khi chạy: không sinh gì', async () => {
    const { data } = await fixture('lesson');
    await prisma.aIJob.update({ where: { id: data.aiJobId }, data: { status: 'CANCELLED' } });
    const llm = stubLlm(() => '{}');
    await processorWith(llm).processor.process(data);
    expect(llm.calls).toBe(0);
    expect(await draftsOf(data.aiJobId)).toHaveLength(0);
    expect((await jobOf(data.aiJobId)).status).toBe('CANCELLED');
  });

  it('huỷ giữa lúc đang gọi LLM: giữ CANCELLED và không lưu thẻ nháp nào', async () => {
    const { data } = await fixture('lesson');
    const llm = stubLlm(
      () => JSON.stringify({ cards: [{ front: 'Q', back: 'A' }] }),
      async () => {
        await prisma.aIJob.update({ where: { id: data.aiJobId }, data: { status: 'CANCELLED' } });
      },
    );
    await processorWith(llm).processor.process(data);
    expect((await jobOf(data.aiJobId)).status).toBe('CANCELLED');
    expect(await draftsOf(data.aiJobId)).toHaveLength(0);
  });

  it('chạy lại cùng job (BullMQ thử lại) không tạo thẻ nháp thứ hai', async () => {
    const { data } = await fixture('lesson');
    const { processor } = processorWith();
    await processor.process(data);
    const first = await draftsOf(data.aiJobId);
    await processor.process(data);
    expect(await draftsOf(data.aiJobId)).toHaveLength(first.length);
  });
});
