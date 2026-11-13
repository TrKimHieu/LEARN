import { requireSandbox, deleteFixtureCourses } from './safety';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@learn/db';
import type {
  DeckSummary,
  DueFlashcardsResponse,
  Flashcard,
  FlashcardReviewResult,
} from '@learn/contracts';

/**
 * Ôn một Bộ thẻ (ticket 03): thẻ đến hạn, chấm Mức nhớ theo SM-2, idempotency, kẹp giờ, quyền sở hữu.
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
    body: JSON.stringify({ email, password: 'FlashTest@12345', displayName: 'Review Test' }),
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
  call(s, 'POST', `/cards/${cardId}/review`, { grade, reviewedAt: reviewedAt.toISOString() }, key);

describe('Ôn một Bộ thẻ', () => {
  let owner: Session;
  let other: Session;

  beforeAll(async () => {
    owner = await register('rev-owner');
    other = await register('rev-other');
  });

  afterAll(async () => {
    for (const s of [owner, other]) {
      if (!s) continue;
      await prisma.flashcardReview.deleteMany({ where: { userId: s.userId } });
      await prisma.flashcard.deleteMany({ where: { userId: s.userId } });
      await prisma.deck.deleteMany({ where: { userId: s.userId } });
      await deleteFixtureCourses(s.userId, (ownerId) =>
        prisma.course.deleteMany({ where: { ownerId } }),
      );
      await prisma.user.deleteMany({ where: { email: s.email } });
    }
  });

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
    expect(out).toMatchObject({ cardId: card.id, intervalDays: 1, repetitions: 1, applied: true });
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
