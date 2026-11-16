import { z } from 'zod';

const Card = z.object({
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
});

export type FlashcardDraftCard = z.infer<typeof Card>;

export type FlashcardValidation =
  { ok: true; cards: FlashcardDraftCard[]; dropped: number } | { ok: false; errors: string[] };

/**
 * Lọc đầu ra sinh thẻ: thẻ sai hình dạng, quá dài hoặc trùng mặt trước bị bỏ, không làm hỏng cả lượt;
 * cắt ở `max`. Không còn thẻ nào dùng được thì báo lỗi để lượt gọi sau sửa theo lý do.
 */
export function validateFlashcardOutput(raw: unknown, max: number): FlashcardValidation {
  const list = (raw as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(list)) return { ok: false, errors: ['cards: phải là một mảng các thẻ'] };

  const seen = new Set<string>();
  const cards: FlashcardDraftCard[] = [];
  let dropped = 0;
  for (const item of list) {
    const parsed = Card.safeParse(item);
    const key = parsed.success ? parsed.data.front.toLowerCase().replace(/\s+/g, ' ') : null;
    if (!parsed.success || key === null || seen.has(key) || cards.length >= max) {
      dropped++;
      continue;
    }
    seen.add(key);
    cards.push(parsed.data);
  }
  if (cards.length === 0) {
    return {
      ok: false,
      errors: [
        'cards: không có thẻ nào hợp lệ (front/back không rỗng, front ≤ 500, back ≤ 1000 ký tự)',
      ],
    };
  }
  return { ok: true, cards, dropped };
}
