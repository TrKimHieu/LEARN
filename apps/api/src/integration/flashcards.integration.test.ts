import { requireSandbox, deleteFixtureCourses } from './safety';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@learn/db';
import type {
  DeckDetailResponse,
  DeckListResponse,
  DeckSummary,
  Flashcard,
} from '@learn/contracts';

/**
 * Thẻ và Bộ thẻ (ticket 02): vòng đời, quyền sở hữu (404 chứ không 403), chuyển thẻ giữ lịch ôn,
 * đầu vào sai báo tiếng Việt. Cần sandbox đang chạy như `quota.integration.test.ts`.
 */
const API_URL = requireSandbox();

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

const call = (s: Session, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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
  let owner: Session;
  let other: Session;
  let ownerCourseId: string;
  let otherCourseId: string;

  beforeAll(async () => {
    owner = await register('deck-owner');
    other = await register('deck-other');
    const mine = await call(owner, 'POST', '/courses', { title: 'Khóa của tôi', language: 'vi' });
    ownerCourseId = ((await mine.json()) as { id: string }).id;
    const theirs = await call(other, 'POST', '/courses', {
      title: 'Khóa người khác',
      language: 'vi',
    });
    otherCourseId = ((await theirs.json()) as { id: string }).id;
  });

  afterAll(async () => {
    for (const s of [owner, other]) {
      if (!s) continue;
      await prisma.flashcard.deleteMany({ where: { userId: s.userId } });
      await prisma.deck.deleteMany({ where: { userId: s.userId } });
      await deleteFixtureCourses(s.userId, (ownerId) =>
        prisma.course.deleteMany({ where: { ownerId } }),
      );
      await prisma.user.deleteMany({ where: { email: s.email } });
    }
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
