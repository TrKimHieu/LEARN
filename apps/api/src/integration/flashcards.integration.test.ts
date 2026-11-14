import { requireSandbox, deleteFixtureCourses } from './safety';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@learn/db';
import type {
  DeckDetailResponse,
  DeckListResponse,
  DeckSummary,
  DueFlashcardsResponse,
  Flashcard,
  FlashcardReviewResult,
} from '@learn/contracts';

/**
 * Thẻ và Bộ thẻ: vòng đời (ticket 02), ôn một bộ (ticket 03), Ôn hôm nay (ticket 04).
 * Một file, hai người dùng dùng chung: `POST /auth/register` giới hạn 10 lần/phút/IP và các bộ test
 * tích hợp chạy song song, nên mỗi file đăng ký riêng sẽ làm cạn hạn mức của test auth.
 * Cần sandbox đang chạy như `quota.integration.test.ts`.
 */
const API_URL = requireSandbox();
const DAY = 86_400_000;

interface Session {
  email: string;
  token: string;
  userId: string;
}

async function register(prefix: string): Promise<Session> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@learn.ai`;
  const res = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'FlashTest@12345', displayName: 'Flash Test' }),
  });
  expect(res.status).toBe(201);
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  return { email, token, userId };
}

const call = (s: Session, method: string, path: string, body?: unknown, key?: string) =>
  fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.token}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let owner: Session;
let other: Session;

beforeAll(async () => {
  owner = await register('flash-owner');
  other = await register('flash-other');
});

afterAll(async () => {
  for (const s of [owner, other]) {
    if (!s) continue;
    await prisma.flashcardDraft.deleteMany({ where: { userId: s.userId } });
    await prisma.aIJob.deleteMany({ where: { requestedById: s.userId } });
    await prisma.documentChunk.deleteMany({ where: { document: { uploaderId: s.userId } } });
    await prisma.document.deleteMany({ where: { uploaderId: s.userId } });
    await prisma.lesson.deleteMany({ where: { course: { ownerId: s.userId } } });
    await prisma.flashcardReview.deleteMany({ where: { userId: s.userId } });
    await prisma.flashcard.deleteMany({ where: { userId: s.userId } });
    await prisma.deck.deleteMany({ where: { userId: s.userId } });
    await deleteFixtureCourses(s.userId, (ownerId) =>
      prisma.course.deleteMany({ where: { ownerId } }),
    );
    await prisma.user.deleteMany({ where: { email: s.email } });
  }
});

{
  async function createDeck(s: Session, title: string, courseId?: string): Promise<DeckSummary> {
    const res = await call(s, 'POST', '/decks', courseId ? { title, courseId } : { title });
    expect(res.status).toBe(201);
    return (await res.json()) as DeckSummary;
  }

  async function createCard(s: Session, deckId: string, front: string, back: string) {
    const res = await call(s, 'POST', `/decks/${deckId}/cards`, { front, back });
    expect(res.status).toBe(201);
    return (await res.json()) as Flashcard;
  }

  describe('Bộ thẻ và Thẻ', () => {
    let ownerCourseId: string;
    let otherCourseId: string;

    beforeAll(async () => {
      const mine = await call(owner, 'POST', '/courses', { title: 'Khóa của tôi', language: 'vi' });
      ownerCourseId = ((await mine.json()) as { id: string }).id;
      const theirs = await call(other, 'POST', '/courses', {
        title: 'Khóa người khác',
        language: 'vi',
      });
      otherCourseId = ((await theirs.json()) as { id: string }).id;
    });

    it('tạo bộ thẻ, gắn khóa học của mình, đổi tên, rồi gỡ khỏi khóa học', async () => {
      const deck = await createDeck(owner, '  Từ vựng bài 1  ', ownerCourseId);
      expect(deck).toMatchObject({
        title: 'Từ vựng bài 1',
        courseId: ownerCourseId,
        cardCount: 0,
        newCount: 0,
        learningCount: 0,
        dueCount: 0,
      });

      const renamed = await call(owner, 'PATCH', `/decks/${deck.id}`, { title: 'Từ vựng bài 2' });
      expect(renamed.status).toBe(200);
      expect(((await renamed.json()) as DeckSummary).title).toBe('Từ vựng bài 2');

      const detached = await call(owner, 'PATCH', `/decks/${deck.id}`, { courseId: null });
      expect(((await detached.json()) as DeckSummary).courseId).toBeNull();
    });

    it('không gắn bộ thẻ vào khóa học của người khác', async () => {
      const res = await call(owner, 'POST', '/decks', { title: 'Lén', courseId: otherCourseId });
      expect(res.status).toBe(404);
    });

    it('đầu vào sai trả 400 với thông báo tiếng Việt', async () => {
      const res = await call(owner, 'POST', '/decks', { title: '   ' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain('Vui lòng nhập tên bộ thẻ.');

      const deck = await createDeck(owner, 'Kiểm đầu vào');
      const long = await call(owner, 'POST', `/decks/${deck.id}/cards`, {
        front: 'x'.repeat(501),
        back: 'y',
      });
      expect(long.status).toBe(400);
      expect(JSON.stringify(await long.json())).toContain('Mặt trước tối đa 500 ký tự.');
    });

    it('thêm, sửa, xóa thẻ và đếm mới/đang học/đến hạn theo bộ', async () => {
      const deck = await createDeck(owner, 'Đếm thẻ');
      const a = await createCard(owner, deck.id, 'Mặt trước A', 'Mặt sau A');
      await createCard(owner, deck.id, 'Mặt trước B', 'Mặt sau B');
      const c = await createCard(owner, deck.id, 'Mặt trước C', 'Mặt sau C');
      // Giả lập một thẻ đã ôn và hẹn ngày mai (ticket 03 sẽ làm việc này qua API ôn).
      await prisma.flashcard.update({
        where: { id: c.id },
        data: {
          lastReviewedAt: new Date(),
          repetitions: 1,
          intervalDays: 1,
          dueAt: new Date(Date.now() + 86_400_000),
        },
      });

      const list = (await (await call(owner, 'GET', '/decks')).json()) as DeckListResponse;
      expect(list.decks.find((d) => d.id === deck.id)).toMatchObject({
        cardCount: 3,
        newCount: 2,
        learningCount: 1,
        dueCount: 2,
      });

      const patched = await call(owner, 'PATCH', `/cards/${a.id}`, { back: 'Mặt sau A (sửa)' });
      expect(patched.status).toBe(200);
      expect(((await patched.json()) as Flashcard).back).toBe('Mặt sau A (sửa)');

      const removed = await call(owner, 'DELETE', `/cards/${a.id}`);
      expect(removed.status).toBe(200);
      const detail = (await (
        await call(owner, 'GET', `/decks/${deck.id}/cards`)
      ).json()) as DeckDetailResponse;
      expect(detail.cards.map((x) => x.id)).not.toContain(a.id);
      expect(detail.deck.cardCount).toBe(2);
    });

    it('chuyển thẻ sang bộ khác giữ nguyên lịch ôn', async () => {
      const from = await createDeck(owner, 'Bộ nguồn');
      const to = await createDeck(owner, 'Bộ đích');
      const card = await createCard(owner, from.id, 'Q', 'A');
      const due = new Date(Date.now() + 3 * 86_400_000);
      await prisma.flashcard.update({
        where: { id: card.id },
        data: { dueAt: due, intervalDays: 3, repetitions: 2, lastReviewedAt: new Date() },
      });

      const moved = await call(owner, 'PATCH', `/cards/${card.id}`, { deckId: to.id });
      expect(moved.status).toBe(200);
      const body = (await moved.json()) as Flashcard;
      expect(body.deckId).toBe(to.id);
      expect(body.intervalDays).toBe(3);
      expect(body.repetitions).toBe(2);
      expect(new Date(body.dueAt).getTime()).toBe(due.getTime());
    });

    it('không chuyển thẻ sang bộ của người khác', async () => {
      const mine = await createDeck(owner, 'Bộ của tôi');
      const theirs = await createDeck(other, 'Bộ của họ');
      const card = await createCard(owner, mine.id, 'Q', 'A');
      const res = await call(owner, 'PATCH', `/cards/${card.id}`, { deckId: theirs.id });
      expect(res.status).toBe(404);
    });

    it('bộ thẻ và thẻ của người khác trả 404, không lộ sự tồn tại', async () => {
      const deck = await createDeck(owner, 'Riêng tư');
      const card = await createCard(owner, deck.id, 'Q', 'A');
      const probes: Array<[string, string, unknown?]> = [
        ['GET', `/decks/${deck.id}/cards`],
        ['PATCH', `/decks/${deck.id}`, { title: 'Chiếm' }],
        ['DELETE', `/decks/${deck.id}`],
        ['POST', `/decks/${deck.id}/cards`, { front: 'x', back: 'y' }],
        ['PATCH', `/cards/${card.id}`, { front: 'x' }],
        ['DELETE', `/cards/${card.id}`],
      ];
      for (const [method, path, body] of probes) {
        const res = await call(other, method, path, body);
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      const list = (await (await call(other, 'GET', '/decks')).json()) as DeckListResponse;
      expect(list.decks.map((d) => d.id)).not.toContain(deck.id);
    });

    it('xóa bộ thẻ: biến mất khỏi danh sách và thẻ bên trong không còn truy cập được', async () => {
      const deck = await createDeck(owner, 'Sắp xóa');
      const card = await createCard(owner, deck.id, 'Q', 'A');

      const res = await call(owner, 'DELETE', `/decks/${deck.id}`);
      expect(res.status).toBe(200);

      const list = (await (await call(owner, 'GET', '/decks')).json()) as DeckListResponse;
      expect(list.decks.map((d) => d.id)).not.toContain(deck.id);
      expect((await call(owner, 'GET', `/decks/${deck.id}/cards`)).status).toBe(404);
      expect((await call(owner, 'PATCH', `/cards/${card.id}`, { front: 'x' })).status).toBe(404);
    });

    it('cần đăng nhập', async () => {
      const res = await fetch(`${API_URL}/api/v1/decks`);
      expect(res.status).toBe(401);
    });
  });
}

{
  async function createDeck(s: Session, title: string): Promise<DeckSummary> {
    const res = await call(s, 'POST', '/decks', { title });
    expect(res.status).toBe(201);
    return (await res.json()) as DeckSummary;
  }

  async function createCard(s: Session, deckId: string, n: number): Promise<Flashcard> {
    const res = await call(s, 'POST', `/decks/${deckId}/cards`, {
      front: `Mặt trước ${n}`,
      back: `Mặt sau ${n}`,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as Flashcard;
  }

  const due = async (s: Session, deckId: string, query = '') =>
    (await (await call(s, 'GET', `/decks/${deckId}/due${query}`)).json()) as DueFlashcardsResponse;

  const review = (s: Session, cardId: string, grade: string, reviewedAt: Date, key?: string) =>
    call(
      s,
      'POST',
      `/cards/${cardId}/review`,
      { grade, reviewedAt: reviewedAt.toISOString() },
      key,
    );

  describe('Ôn một Bộ thẻ', () => {
    it('liệt kê thẻ đến hạn của bộ, cắt theo limit nhưng dueCount vẫn là tổng', async () => {
      const deck = await createDeck(owner, 'Đến hạn');
      for (let n = 1; n <= 3; n++) await createCard(owner, deck.id, n);

      const all = await due(owner, deck.id);
      expect(all.cards).toHaveLength(3);
      expect(all.dueCount).toBe(3);
      expect(all.nextDueAt).toBeNull();
      expect(all.cards[0]).toMatchObject({ deckId: deck.id, front: 'Mặt trước 1' });

      const limited = await due(owner, deck.id, '?limit=2');
      expect(limited.cards).toHaveLength(2);
      expect(limited.dueCount).toBe(3);
    });

    it('bộ trống: không có thẻ, không có hạn kế tiếp', async () => {
      const deck = await createDeck(owner, 'Trống');
      expect(await due(owner, deck.id)).toEqual({ cards: [], dueCount: 0, nextDueAt: null });
    });

    it('GOOD lần đầu: ôn lại sau 1 ngày, thẻ rời danh sách và bộ ghi nhận đang học', async () => {
      const deck = await createDeck(owner, 'Chấm Tốt');
      const card = await createCard(owner, deck.id, 1);
      await createCard(owner, deck.id, 2);
      const reviewedAt = new Date();

      const res = await review(owner, card.id, 'GOOD', reviewedAt);
      expect(res.status).toBe(201);
      const out = (await res.json()) as FlashcardReviewResult;
      expect(out).toMatchObject({
        cardId: card.id,
        intervalDays: 1,
        repetitions: 1,
        applied: true,
      });
      expect(new Date(out.dueAt).getTime()).toBe(reviewedAt.getTime() + DAY);

      const after = await due(owner, deck.id);
      expect(after.cards.map((c) => c.id)).not.toContain(card.id);
      expect(after.dueCount).toBe(1);
      expect(after.nextDueAt).toBe(out.dueAt);

      const list = (await (await call(owner, 'GET', '/decks')).json()) as { decks: DeckSummary[] };
      expect(list.decks.find((d) => d.id === deck.id)).toMatchObject({
        newCount: 1,
        learningCount: 1,
        dueCount: 1,
      });
    });

    it('AGAIN: quay lại sau 1 ngày, đặt lại lần lặp và tính một lần quên', async () => {
      const deck = await createDeck(owner, 'Chấm Quên');
      const card = await createCard(owner, deck.id, 1);
      const res = await review(owner, card.id, 'AGAIN', new Date());
      const out = (await res.json()) as FlashcardReviewResult;
      expect(out).toMatchObject({ intervalDays: 1, repetitions: 0, applied: true });
      expect(out.easeFactor).toBeLessThan(2.5);
      const row = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      expect(row.lapses).toBe(1);
    });

    it('EASY giãn xa hơn GOOD trên cùng trạng thái thẻ', async () => {
      const deck = await createDeck(owner, 'Dễ và Tốt');
      const a = await createCard(owner, deck.id, 1);
      const b = await createCard(owner, deck.id, 2);
      const seasoned = {
        repetitions: 2,
        intervalDays: 6,
        lastReviewedAt: new Date(Date.now() - 6 * DAY),
      };
      await prisma.flashcard.updateMany({ where: { id: { in: [a.id, b.id] } }, data: seasoned });

      const good = (await (
        await review(owner, a.id, 'GOOD', new Date())
      ).json()) as FlashcardReviewResult;
      const easy = (await (
        await review(owner, b.id, 'EASY', new Date())
      ).json()) as FlashcardReviewResult;
      expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    });

    it('gửi lại cùng Idempotency-Key trả kết quả cũ, không chấm lần hai', async () => {
      const deck = await createDeck(owner, 'Idempotency');
      const card = await createCard(owner, deck.id, 1);
      const at = new Date(Date.now() - 30_000);
      const key = `key-${Date.now()}-abc123`;

      const first = await review(owner, card.id, 'GOOD', at, key);
      const firstBody = await first.json();
      const replay = await review(owner, card.id, 'GOOD', at, key);
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(firstBody);

      const row = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      expect(row.repetitions).toBe(1);
      expect(await prisma.flashcardReview.count({ where: { flashcardId: card.id } })).toBe(1);

      const clash = await review(owner, card.id, 'EASY', at, key);
      expect(clash.status).toBe(409);
      expect(JSON.stringify(await clash.json())).toContain('IDEMPOTENCY_KEY_REUSED');
    });

    it('lượt chấm cũ hơn lượt đã áp dụng chỉ lưu lịch sử, không đổi lịch', async () => {
      const deck = await createDeck(owner, 'Chấm cũ');
      const card = await createCard(owner, deck.id, 1);
      const last = new Date(Date.now() - 3_600_000);
      const dueAt = new Date(last.getTime() + 6 * DAY);
      await prisma.flashcard.update({
        where: { id: card.id },
        data: { repetitions: 2, intervalDays: 6, lastReviewedAt: last, dueAt },
      });

      const res = await review(owner, card.id, 'AGAIN', new Date(last.getTime() - 3_600_000));
      const out = (await res.json()) as FlashcardReviewResult;
      expect(out).toMatchObject({ applied: false, intervalDays: 6, repetitions: 2 });
      expect(new Date(out.dueAt).getTime()).toBe(dueAt.getTime());

      const row = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      expect(row.repetitions).toBe(2);
      expect(row.lapses).toBe(0);
      expect(await prisma.flashcardReview.count({ where: { flashcardId: card.id } })).toBe(1);
    });

    it('giờ chấm ở tương lai bị kẹp về giờ server', async () => {
      const deck = await createDeck(owner, 'Giờ tương lai');
      const card = await createCard(owner, deck.id, 1);
      const before = Date.now();
      const out = (await (
        await review(owner, card.id, 'GOOD', new Date(before + 5 * DAY))
      ).json()) as FlashcardReviewResult;
      expect(new Date(out.dueAt).getTime()).toBeLessThan(before + 2 * DAY);
    });

    it('thẻ của người khác trả 404 và không ghi gì', async () => {
      const deck = await createDeck(owner, 'Riêng tư');
      const card = await createCard(owner, deck.id, 1);

      expect((await call(other, 'GET', `/decks/${deck.id}/due`)).status).toBe(404);
      expect((await review(other, card.id, 'GOOD', new Date())).status).toBe(404);
      expect(await prisma.flashcardReview.count({ where: { flashcardId: card.id } })).toBe(0);
      const row = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      expect(row.lastReviewedAt).toBeNull();
    });

    it('bộ đã xóa không còn ôn được', async () => {
      const deck = await createDeck(owner, 'Đã xóa');
      const card = await createCard(owner, deck.id, 1);
      await call(owner, 'DELETE', `/decks/${deck.id}`);
      expect((await call(owner, 'GET', `/decks/${deck.id}/due`)).status).toBe(404);
      expect((await review(owner, card.id, 'GOOD', new Date())).status).toBe(404);
    });

    it('đầu vào sai trả 400', async () => {
      const deck = await createDeck(owner, 'Đầu vào');
      const card = await createCard(owner, deck.id, 1);
      const bad = await call(owner, 'POST', `/cards/${card.id}/review`, { grade: 'PERFECT' });
      expect(bad.status).toBe(400);
      const badKey = await review(owner, card.id, 'GOOD', new Date(), 'x');
      expect(badKey.status).toBe(400);
      const tooMany = await call(owner, 'GET', `/decks/${deck.id}/due?limit=51`);
      expect(tooMany.status).toBe(400);
    });
  });
}

{
  async function deckWithCards(s: Session, title: string, count: number) {
    const deck = (await (await call(s, 'POST', '/decks', { title })).json()) as DeckSummary;
    const cards: Flashcard[] = [];
    for (let n = 1; n <= count; n++) {
      const res = await call(s, 'POST', `/decks/${deck.id}/cards`, {
        front: `${title} ${n}`,
        back: `Đáp ${n}`,
      });
      cards.push((await res.json()) as Flashcard);
    }
    return { deck, cards };
  }

  const dueAll = async (s: Session, query = '') =>
    (await (await call(s, 'GET', `/flashcards/due${query}`)).json()) as DueFlashcardsResponse;

  describe('Ôn hôm nay: thẻ đến hạn của mọi bộ', () => {
    // Số đếm toàn người dùng: bỏ thẻ và bộ do các nhóm test trước để lại.
    beforeAll(async () => {
      for (const s of [owner, other]) {
        await prisma.flashcardReview.deleteMany({ where: { userId: s.userId } });
        await prisma.flashcard.deleteMany({ where: { userId: s.userId } });
        await prisma.deck.deleteMany({ where: { userId: s.userId } });
      }
    });

    it('người dùng chưa có thẻ nào: không có thẻ, không có hạn kế tiếp', async () => {
      expect(await dueAll(owner)).toEqual({ cards: [], dueCount: 0, nextDueAt: null });
    });

    it('gom thẻ đến hạn của nhiều bộ, hạn sớm nhất trước, dueCount là tổng', async () => {
      const a = await deckWithCards(owner, 'Bộ A', 2);
      const b = await deckWithCards(owner, 'Bộ B', 2);
      // Đẩy một thẻ của B lên trước mọi thẻ khác để kiểm thứ tự theo hạn, không theo bộ.
      await prisma.flashcard.update({
        where: { id: b.cards[1]!.id },
        data: { dueAt: new Date(Date.now() - DAY) },
      });

      const all = await dueAll(owner);
      expect(all.dueCount).toBe(4);
      expect(all.cards).toHaveLength(4);
      expect(all.cards[0]!.id).toBe(b.cards[1]!.id);
      expect(new Set(all.cards.map((c) => c.deckId))).toEqual(new Set([a.deck.id, b.deck.id]));

      const limited = await dueAll(owner, '?limit=3');
      expect(limited.cards).toHaveLength(3);
      expect(limited.dueCount).toBe(4);
    });

    it('thẻ chưa đến hạn không vào danh sách nhưng cho ra hạn kế tiếp', async () => {
      const { cards } = await deckWithCards(owner, 'Bộ hẹn sau', 1);
      const later = new Date(Date.now() + 3 * DAY);
      await prisma.flashcard.update({ where: { id: cards[0]!.id }, data: { dueAt: later } });

      const all = await dueAll(owner);
      expect(all.cards.map((c) => c.id)).not.toContain(cards[0]!.id);
      expect(all.nextDueAt).toBe(later.toISOString());
    });

    it('không gom thẻ của người khác, và bộ đã xóa thì thẻ biến mất', async () => {
      const mine = await deckWithCards(owner, 'Bộ sẽ xóa', 1);
      const theirs = await deckWithCards(other, 'Bộ người khác', 3);
      const before = await dueAll(owner);
      expect(before.cards.map((c) => c.id)).not.toContain(theirs.cards[0]!.id);
      expect((await dueAll(other)).dueCount).toBe(3);

      await call(owner, 'DELETE', `/decks/${mine.deck.id}`);
      const after = await dueAll(owner);
      expect(after.cards.map((c) => c.id)).not.toContain(mine.cards[0]!.id);
      expect(after.dueCount).toBe(before.dueCount - 1);
    });

    it('limit ngoài khoảng trả 400, thiếu đăng nhập trả 401', async () => {
      expect((await call(owner, 'GET', '/flashcards/due?limit=51')).status).toBe(400);
      expect((await fetch(`${API_URL}/api/v1/flashcards/due`)).status).toBe(401);
    });
  });
}

// ── Sinh Thẻ nháp bằng AI (ticket 06) ─────────────────────────────────────────────────────────
{
  interface JobSummary {
    id: string;
    type: string;
    status: string;
    courseId: string;
  }
  const generate = (s: Session, courseId: string, body: unknown) =>
    call(s, 'POST', `/ai/courses/${courseId}/generate-flashcards`, body);
  const jobCount = (courseId: string) =>
    prisma.aIJob.count({ where: { courseId, type: 'GENERATE_FLASHCARDS' } });

  async function courseWithSources(s: Session, title: string) {
    const created = await call(s, 'POST', '/courses', { title, language: 'vi' });
    const courseId = ((await created.json()) as { id: string }).id;
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        orderIndex: 0,
        title: 'Bài 1',
        contentMd: 'TCP là giao thức hướng kết nối.',
      },
    });
    const mk = (status: 'EXTRACTED' | 'UPLOADED') =>
      prisma.document.create({
        data: {
          courseId,
          uploaderId: s.userId,
          filename: `${status}.md`,
          mimeType: 'text/markdown',
          sizeBytes: 10,
          storageKey: `${s.userId}/${status}-${Date.now()}`,
          checksumSha256: 'test',
          status,
        },
      });
    return { courseId, lesson, extracted: await mk('EXTRACTED'), pending: await mk('UPLOADED') };
  }

  describe('Sinh thẻ nháp: tạo job', () => {
    let mine: Awaited<ReturnType<typeof courseWithSources>>;
    let theirs: Awaited<ReturnType<typeof courseWithSources>>;

    beforeAll(async () => {
      mine = await courseWithSources(owner, 'Khóa sinh thẻ');
      theirs = await courseWithSources(other, 'Khóa người khác');
    });

    it('từ một bài học: 201, job GENERATE_FLASHCARDS đang xếp hàng', async () => {
      const res = await generate(owner, mine.courseId, { lessonId: mine.lesson.id, count: 5 });
      expect(res.status).toBe(201);
      const job = (await res.json()) as JobSummary;
      expect(job).toMatchObject({
        type: 'GENERATE_FLASHCARDS',
        status: 'QUEUED',
        courseId: mine.courseId,
      });
      expect(await jobCount(mine.courseId)).toBe(1);
    });

    it('gọi lại khi job còn chạy: trả job cũ, không tạo thêm', async () => {
      const first = (await (
        await generate(owner, mine.courseId, { lessonId: mine.lesson.id, count: 5 })
      ).json()) as JobSummary;
      expect(await jobCount(mine.courseId)).toBe(1);
      const again = (await (
        await generate(owner, mine.courseId, { lessonId: mine.lesson.id, count: 5 })
      ).json()) as JobSummary;
      expect(again.id).toBe(first.id);
    });

    it('từ một tài liệu đã trích xuất: 201', async () => {
      const res = await generate(owner, mine.courseId, { documentId: mine.extracted.id });
      expect(res.status).toBe(201);
    });

    it('tài liệu chưa trích xuất xong: 409 và không tạo job', async () => {
      const before = await jobCount(mine.courseId);
      const res = await generate(owner, mine.courseId, { documentId: mine.pending.id });
      expect(res.status).toBe(409);
      expect(await jobCount(mine.courseId)).toBe(before);
    });

    it('nguồn của người khác hoặc khóa học khác: 404', async () => {
      const own = { lessonId: theirs.lesson.id };
      expect((await generate(owner, theirs.courseId, own)).status).toBe(404);
      expect((await generate(owner, mine.courseId, own)).status).toBe(404);
      const doc = { documentId: theirs.extracted.id };
      expect((await generate(owner, mine.courseId, doc)).status).toBe(404);
    });

    it('đầu vào sai: 400 (thiếu nguồn, hai nguồn, count ngoài khoảng)', async () => {
      const lessonId = mine.lesson.id;
      expect((await generate(owner, mine.courseId, {})).status).toBe(400);
      const both = { lessonId, documentId: mine.extracted.id };
      expect((await generate(owner, mine.courseId, both)).status).toBe(400);
      expect((await generate(owner, mine.courseId, { lessonId, count: 31 })).status).toBe(400);
      expect((await generate(owner, mine.courseId, { lessonId, count: 0 })).status).toBe(400);
    });

    it('cần đăng nhập', async () => {
      const res = await fetch(`${API_URL}/api/v1/ai/courses/${mine.courseId}/generate-flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: mine.lesson.id }),
      });
      expect(res.status).toBe(401);
    });

    it('hết hạn mức AI của gói: 402 QUOTA_EXCEEDED và không tạo thêm job', async () => {
      // Gói FREE cho 10 lượt AI mỗi tháng; đổi `count` để mỗi lượt là một job khác nhau.
      let rejected: Response | null = null;
      for (let n = 1; n <= 12 && !rejected; n++) {
        const body = { lessonId: theirs.lesson.id, count: n };
        const res = await generate(other, theirs.courseId, body);
        if (res.status !== 201) rejected = res;
      }
      expect(rejected?.status).toBe(402);
      expect(JSON.stringify(await rejected!.json())).toContain('QUOTA_EXCEEDED');
      expect(await jobCount(theirs.courseId)).toBe(10);
    });
  });
}

// ── Duyệt Thẻ nháp (ticket 07) ────────────────────────────────────────────────────────────────
{
  async function seedDrafts(s: Session, count: number) {
    const course = await prisma.course.create({ data: { ownerId: s.userId, title: 'Khóa nháp' } });
    const job = await prisma.aIJob.create({
      data: {
        courseId: course.id,
        requestedById: s.userId,
        type: 'GENERATE_FLASHCARDS',
        status: 'SUCCEEDED',
        idempotencyKey: `draft-seed-${Date.now()}-${Math.random()}`,
        inputParams: {},
      },
    });
    const drafts = [];
    for (let n = 1; n <= count; n++) {
      drafts.push(
        await prisma.flashcardDraft.create({
          data: {
            userId: s.userId,
            courseId: course.id,
            aiJobId: job.id,
            front: `Nháp ${n}`,
            back: `Đáp ${n}`,
          },
        }),
      );
    }
    return { job, drafts };
  }
  type DraftList = { drafts: Array<{ id: string; front: string; back: string; aiJobId: string }> };
  const listDrafts = async (s: Session, query = '') =>
    (await (await call(s, 'GET', `/flashcards/drafts${query}`)).json()) as DraftList;
  const accept = (s: Session, body: unknown) => call(s, 'POST', '/flashcards/drafts/accept', body);
  const makeDeck = async (s: Session, title: string) =>
    (await (await call(s, 'POST', '/decks', { title })).json()) as DeckSummary;

  describe('Duyệt thẻ nháp', () => {
    it('liệt kê nháp của mình, lọc theo job, không thấy nháp của người khác', async () => {
      const a = await seedDrafts(owner, 2);
      const b = await seedDrafts(owner, 1);
      const theirs = await seedDrafts(other, 1);

      const all = await listDrafts(owner);
      const ids = all.drafts.map((d) => d.id);
      expect(ids).toEqual(expect.arrayContaining([...a.drafts, ...b.drafts].map((d) => d.id)));
      expect(ids).not.toContain(theirs.drafts[0]!.id);

      const onlyA = await listDrafts(owner, `?aiJobId=${a.job.id}`);
      expect(onlyA.drafts.map((d) => d.id).sort()).toEqual(a.drafts.map((d) => d.id).sort());
    });

    it('sửa nháp: lưu nội dung mới, báo lỗi tiếng Việt khi sai, 404 với nháp của người khác', async () => {
      const draft = (await seedDrafts(owner, 1)).drafts[0]!;
      const edited = await call(owner, 'PATCH', `/flashcards/drafts/${draft.id}`, {
        front: '  Mặt trước mới ',
        back: 'Mặt sau mới',
      });
      expect(edited.status).toBe(200);
      expect(await edited.json()).toMatchObject({ front: 'Mặt trước mới', back: 'Mặt sau mới' });

      const bad = await call(owner, 'PATCH', `/flashcards/drafts/${draft.id}`, { front: '' });
      expect(bad.status).toBe(400);
      expect(JSON.stringify(await bad.json())).toContain('Vui lòng nhập mặt trước của thẻ.');

      const foreign = await call(other, 'PATCH', `/flashcards/drafts/${draft.id}`, { front: 'x' });
      expect(foreign.status).toBe(404);
    });

    it('bỏ nháp: biến mất; nháp của người khác trả 404 và còn nguyên', async () => {
      const draft = (await seedDrafts(owner, 1)).drafts[0]!;
      expect((await call(other, 'DELETE', `/flashcards/drafts/${draft.id}`)).status).toBe(404);
      expect(await prisma.flashcardDraft.count({ where: { id: draft.id } })).toBe(1);
      expect((await call(owner, 'DELETE', `/flashcards/drafts/${draft.id}`)).status).toBe(200);
      expect(await prisma.flashcardDraft.count({ where: { id: draft.id } })).toBe(0);
    });

    it('chấp nhận vào bộ có sẵn: thành Thẻ đến hạn ngay, nháp biến mất', async () => {
      const deck = await makeDeck(owner, 'Bộ nhận nháp');
      const { drafts } = await seedDrafts(owner, 3);
      const ids = drafts.map((d) => d.id);
      const res = await accept(owner, { draftIds: ids, deckId: deck.id });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ deckId: deck.id, accepted: 3 });

      const detail = (await (
        await call(owner, 'GET', `/decks/${deck.id}/cards`)
      ).json()) as DeckDetailResponse;
      expect(detail.cards.map((c) => c.front).sort()).toEqual(['Nháp 1', 'Nháp 2', 'Nháp 3']);
      expect(detail.deck).toMatchObject({ cardCount: 3, newCount: 3, dueCount: 3 });
      expect(await prisma.flashcardDraft.count({ where: { id: { in: ids } } })).toBe(0);
    });

    it('chấp nhận vào bộ mới đặt tên', async () => {
      const { drafts } = await seedDrafts(owner, 2);
      const res = await accept(owner, {
        draftIds: drafts.map((d) => d.id),
        newDeckTitle: 'Bộ từ AI',
      });
      expect(res.status).toBe(201);
      const out = (await res.json()) as { deckId: string; accepted: number };
      expect(out.accepted).toBe(2);
      const list = (await (await call(owner, 'GET', '/decks')).json()) as DeckListResponse;
      expect(list.decks.find((d) => d.id === out.deckId)).toMatchObject({
        title: 'Bộ từ AI',
        cardCount: 2,
      });
    });

    it('nháp chưa chấp nhận không có lịch ôn: không vào danh sách đến hạn', async () => {
      await prisma.flashcard.deleteMany({ where: { userId: owner.userId } });
      await prisma.deck.deleteMany({ where: { userId: owner.userId } });
      await seedDrafts(owner, 2);
      const due = (await (
        await call(owner, 'GET', '/flashcards/due')
      ).json()) as DueFlashcardsResponse;
      expect(due).toEqual({ cards: [], dueCount: 0, nextDueAt: null });
    });

    it('id không thuộc về mình hoặc bộ đích của người khác: 404 và không đổi gì', async () => {
      const mine = await seedDrafts(owner, 2);
      const theirs = await seedDrafts(other, 1);
      const myDeck = await makeDeck(owner, 'Bộ đích');
      const theirDeck = await makeDeck(other, 'Bộ họ');

      const mixed = await accept(owner, {
        draftIds: [mine.drafts[0]!.id, theirs.drafts[0]!.id],
        deckId: myDeck.id,
      });
      expect(mixed.status).toBe(404);
      const toTheirs = await accept(owner, {
        draftIds: [mine.drafts[0]!.id],
        deckId: theirDeck.id,
      });
      expect(toTheirs.status).toBe(404);

      expect(await prisma.flashcardDraft.count({ where: { id: mine.drafts[0]!.id } })).toBe(1);
      expect(await prisma.flashcardDraft.count({ where: { id: theirs.drafts[0]!.id } })).toBe(1);
      const decks = [myDeck.id, theirDeck.id];
      expect(await prisma.flashcard.count({ where: { deckId: { in: decks } } })).toBe(0);
    });

    it('chấp nhận hai lần cùng lúc: chỉ một lần thành công, không tạo thẻ trùng', async () => {
      const deck = await makeDeck(owner, 'Bộ song song');
      const { drafts } = await seedDrafts(owner, 4);
      const body = { draftIds: drafts.map((d) => d.id), deckId: deck.id };
      const results = await Promise.all([accept(owner, body), accept(owner, body)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 404]);
      expect(await prisma.flashcard.count({ where: { deckId: deck.id } })).toBe(4);
    });

    it('đầu vào sai: thiếu đích, đủ hai đích, danh sách rỗng đều trả 400', async () => {
      const { drafts } = await seedDrafts(owner, 1);
      const deck = await makeDeck(owner, 'Bộ kiểm');
      const ids = [drafts[0]!.id];
      expect((await accept(owner, { draftIds: ids })).status).toBe(400);
      const both = { draftIds: ids, deckId: deck.id, newDeckTitle: 'Cả hai' };
      expect((await accept(owner, both)).status).toBe(400);
      expect((await accept(owner, { draftIds: [], deckId: deck.id })).status).toBe(400);
    });
  });
}
