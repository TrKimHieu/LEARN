import { randomInt } from 'node:crypto';

/** Chữ và số dễ đọc: bỏ O/0/I/1 (khớp `friendCodeSchema` trong contracts). */
export const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FRIEND_CODE_LENGTH = 8;
export const MAX_FRIENDS = 100;
export const EMAIL_INVITE_MESSAGE = 'Nếu email này có tài khoản, lời mời kết bạn đã được gửi.';

export function newFriendCode(rand: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++)
    code += FRIEND_CODE_ALPHABET[rand(FRIEND_CODE_ALPHABET.length)];
  return code;
}

export interface WeeklyXpRow {
  userId: string;
  displayName: string;
  xp: number;
  /** Lần cuối có XP trong tuần; ai đạt cùng mức sớm hơn xếp trên. */
  lastAt: Date | null;
}

export function rankWeekly(rows: WeeklyXpRow[], meId: string) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.xp - a.xp ||
      (a.lastAt?.getTime() ?? Infinity) - (b.lastAt?.getTime() ?? Infinity) ||
      a.displayName.localeCompare(b.displayName, 'vi'),
  );
  return sorted.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    displayName: r.displayName,
    xp: r.xp,
    me: r.userId === meId,
  }));
}
