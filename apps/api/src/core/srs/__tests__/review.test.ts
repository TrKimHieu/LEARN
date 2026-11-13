import { describe, expect, it } from 'vitest';
import { reviewCard, type ReviewableCard } from '../review';

const DAY = 86_400_000;
const now = new Date('2026-11-13T10:00:00.000Z');
const created = new Date('2026-11-10T00:00:00.000Z');

const fresh: ReviewableCard = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  dueAt: created,
  lastReviewedAt: null,
  createdAt: created,
};

describe('reviewCard', () => {
  it('schedules the next review from the review time, not from now', () => {
    const claimed = new Date(now.getTime() - 3_600_000);
    const out = reviewCard(fresh, 'GOOD', claimed, now);
    expect(out.applied).toBe(true);
    expect(out.reviewedAt).toEqual(claimed);
    expect(out.state).toMatchObject({ intervalDays: 1, repetitions: 1 });
    expect(out.dueAt.getTime()).toBe(claimed.getTime() + DAY);
  });

  it('caps a client time in the future at server now', () => {
    const out = reviewCard(fresh, 'GOOD', new Date(now.getTime() + DAY), now);
    expect(out.reviewedAt).toEqual(now);
  });

  it('never dates a first review before the card existed', () => {
    const out = reviewCard(fresh, 'GOOD', new Date(created.getTime() - DAY), now);
    expect(out.reviewedAt).toEqual(created);
  });

  it('keeps the schedule untouched when the review is older than the last applied one', () => {
    const last = new Date('2026-11-12T10:00:00.000Z');
    const reviewed: ReviewableCard = {
      ...fresh,
      repetitions: 2,
      intervalDays: 6,
      easeFactor: 2.6,
      dueAt: new Date(last.getTime() + 6 * DAY),
      lastReviewedAt: last,
    };
    const out = reviewCard(reviewed, 'AGAIN', new Date(last.getTime() - 1000), now);
    expect(out.applied).toBe(false);
    expect(out.state).toMatchObject({ intervalDays: 6, repetitions: 2, easeFactor: 2.6 });
    expect(out.dueAt).toEqual(reviewed.dueAt);
  });

  it('gives AGAIN a one-day interval and counts the lapse', () => {
    const out = reviewCard(fresh, 'AGAIN', now, now);
    expect(out.state).toMatchObject({ intervalDays: 1, repetitions: 0, lapses: 1 });
    expect(out.dueAt.getTime()).toBe(now.getTime() + DAY);
  });

  it('spaces EASY further out than GOOD on the same card', () => {
    const twice: ReviewableCard = {
      ...fresh,
      repetitions: 2,
      intervalDays: 6,
      lastReviewedAt: new Date(now.getTime() - 6 * DAY),
    };
    const good = reviewCard(twice, 'GOOD', now, now);
    const easy = reviewCard(twice, 'EASY', now, now);
    expect(easy.state.intervalDays).toBeGreaterThan(good.state.intervalDays);
  });
});
