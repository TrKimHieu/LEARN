import { describe, expect, it } from 'vitest';
import { friendCodeSchema } from '@learn/contracts';
import { FRIEND_CODE_ALPHABET, newFriendCode, rankWeekly } from '../friends-rules';

describe('newFriendCode', () => {
  it('sinh mã 8 ký tự hợp lệ theo contracts', () => {
    for (let i = 0; i < 50; i++)
      expect(friendCodeSchema.safeParse(newFriendCode()).success).toBe(true);
  });

  it('không dùng ký tự dễ nhầm', () => {
    expect(FRIEND_CODE_ALPHABET).not.toMatch(/[O0I1]/);
    expect(newFriendCode(() => 0)).toBe('AAAAAAAA');
  });
});

describe('rankWeekly', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 10, 20, h));

  it('XP cao xếp trên; bằng XP thì ai đạt sớm hơn xếp trên; không có XP xếp cuối', () => {
    const ranked = rankWeekly(
      [
        { userId: 'a', displayName: 'An', xp: 30, lastAt: t(9) },
        { userId: 'b', displayName: 'Bình', xp: 30, lastAt: t(8) },
        { userId: 'c', displayName: 'Chi', xp: 0, lastAt: null },
        { userId: 'd', displayName: 'Dũng', xp: 50, lastAt: t(10) },
      ],
      'a',
    );
    expect(ranked.map((r) => r.userId)).toEqual(['d', 'b', 'a', 'c']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked.find((r) => r.me)?.userId).toBe('a');
  });
});
