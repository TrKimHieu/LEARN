import { describe, it, expect, vi } from 'vitest';
import type { DueFlashcardsResponse, DueReviewsResponse, ReviewCard } from '@learn/contracts';
import { ReviewsService } from '../reviews.service';

const iso = (min: number) => new Date(Date.UTC(2026, 10, 25, 0, min)).toISOString();

const question = (id: string, min: number): ReviewCard => ({
  questionId: id,
  prompt: `p ${id}`,
  type: 'TRUE_FALSE',
  answerText: 'Đúng',
  explanation: null,
  courseId: 'c1',
  courseTitle: 'Khoá',
  lessonId: 'l1',
  lessonTitle: 'Bài',
  dueAt: iso(min),
  intervalDays: 0,
  repetitions: 0,
});

const flash = (id: string, min: number) => ({
  id,
  deckId: 'd1',
  front: `f ${id}`,
  back: `b ${id}`,
  dueAt: iso(min),
  intervalDays: 0,
  repetitions: 0,
});

function setup(q: DueReviewsResponse, f: DueFlashcardsResponse) {
  const flashcards = {
    dueCards: vi.fn(async () => f),
    listDecks: vi.fn(async () => ({ decks: [{ id: 'd1', title: 'Bộ 1' }] })),
  };
  const service = new ReviewsService({} as never, {} as never, {} as never, flashcards as never);
  vi.spyOn(service, 'due').mockResolvedValue(q);
  return { service, flashcards };
}

describe('ReviewsService.queue', () => {
  it('trộn theo dueAt tăng dần và cắt 20', async () => {
    const qs = Array.from({ length: 15 }, (_, i) => question(`q${i}`, i * 2));
    const fs = Array.from({ length: 15 }, (_, i) => flash(`f${i}`, i * 2 + 1));
    const { service } = setup(
      { cards: qs, dueCount: 15, nextDueAt: null },
      { cards: fs, dueCount: 15, nextDueAt: null },
    );
    const r = await service.queue('u1');
    expect(r.items).toHaveLength(20);
    expect(r.dueCount).toBe(30);
    const times = r.items.map((i) => i.dueAt);
    expect([...times].sort()).toEqual(times);
    expect(r.items[0]).toMatchObject({ kind: 'question', questionId: 'q0' });
    expect(r.items[1]).toMatchObject({ kind: 'flashcard', id: 'f0' });
  });

  it('một nguồn rỗng vẫn trả nguồn còn lại', async () => {
    const { service } = setup(
      {
        cards: [question('q1', 1), question('q2', 2), question('q3', 3)],
        dueCount: 3,
        nextDueAt: null,
      },
      { cards: [], dueCount: 0, nextDueAt: null },
    );
    const r = await service.queue('u1');
    expect(r.items.map((i) => i.kind)).toEqual(['question', 'question', 'question']);
    expect(r.dueCount).toBe(3);
  });

  it('cùng dueAt: câu hỏi trước, rồi theo id', async () => {
    const { service } = setup(
      { cards: [question('qb', 5), question('qa', 5)], dueCount: 2, nextDueAt: null },
      { cards: [flash('fa', 5)], dueCount: 1, nextDueAt: null },
    );
    const r = await service.queue('u1');
    expect(r.items.map((i) => (i.kind === 'question' ? i.questionId : i.id))).toEqual([
      'qa',
      'qb',
      'fa',
    ]);
  });

  it('gắn deckTitle cho flashcard', async () => {
    const { service } = setup(
      { cards: [], dueCount: 0, nextDueAt: null },
      { cards: [flash('f1', 1)], dueCount: 1, nextDueAt: null },
    );
    const r = await service.queue('u1');
    expect(r.items[0]).toMatchObject({ kind: 'flashcard', deckTitle: 'Bộ 1' });
  });

  it('nextDueAt là nhỏ nhất, null khi cả hai null', async () => {
    const a = setup(
      { cards: [], dueCount: 0, nextDueAt: iso(30) },
      { cards: [], dueCount: 0, nextDueAt: iso(10) },
    );
    expect((await a.service.queue('u1')).nextDueAt).toBe(iso(10));
    const b = setup(
      { cards: [], dueCount: 0, nextDueAt: null },
      { cards: [], dueCount: 0, nextDueAt: null },
    );
    expect((await b.service.queue('u1')).nextDueAt).toBeNull();
  });
});
