/**
 * Luật XP (spec 2026-11-20, ADR 006 của mobile). Server là nguồn duy nhất: client không bao giờ gửi
 * số XP, chỉ làm hành động học; XP được ghi trong cùng transaction với hành động đó.
 */
export type XpSource = 'SUBMISSION' | 'CARD_REVIEW' | 'FLASHCARD_REVIEW';

/** Trần XP mỗi ngày học; vượt trần thì tiến độ vẫn lưu, chỉ không cộng XP. */
export const DAILY_XP_CAP = 100;

/** Nộp bài luyện tập: lần đầu trong ngày của bài tập đó (lần sau trùng khoá, không cộng). */
export function submissionXp(passed: boolean): number {
  return 10 + (passed ? 5 : 0);
}

/** Chấm Mức nhớ một thẻ (câu hỏi hoặc thẻ tự tạo), tối đa một lần mỗi thẻ mỗi ngày. */
export const REVIEW_XP = 1;

/** Phần còn được cộng hôm nay, không âm. */
export function grantable(amount: number, earnedToday: number, cap = DAILY_XP_CAP): number {
  return Math.max(0, Math.min(amount, cap - earnedToday));
}

/** Thứ Hai của tuần chứa `dayKey` (YYYY-MM-DD), cũng dạng YYYY-MM-DD. Tuần bắt đầu thứ Hai. */
export function weekStartKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // CN=0 → lùi 6, T2=1 → lùi 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
