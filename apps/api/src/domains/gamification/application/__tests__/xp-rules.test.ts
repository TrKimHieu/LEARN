import { describe, expect, it } from 'vitest';
import { DAILY_XP_CAP, grantable, submissionXp, weekStartKey } from '../xp-rules';

describe('xp rules', () => {
  it('gives 10 XP for a submission and 5 more when passed', () => {
    expect(submissionXp(false)).toBe(10);
    expect(submissionXp(true)).toBe(15);
  });

  it('never grants past the daily cap', () => {
    expect(grantable(15, 0)).toBe(15);
    expect(grantable(15, DAILY_XP_CAP - 4)).toBe(4);
    expect(grantable(15, DAILY_XP_CAP)).toBe(0);
    expect(grantable(1, DAILY_XP_CAP + 3)).toBe(0);
  });

  it('starts the week on Monday', () => {
    expect(weekStartKey('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekStartKey('2026-11-20')).toBe('2026-11-16'); // Friday
    expect(weekStartKey('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(weekStartKey('2026-11-01')).toBe('2026-10-26'); // Sunday across months
  });
});
