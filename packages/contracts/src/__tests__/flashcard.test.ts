import { describe, expect, it } from 'vitest';
import { createDeckSchema, createFlashcardSchema, patchFlashcardSchema } from '../flashcard';

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe('flashcard contracts', () => {
  it('trims and requires a deck title with a Vietnamese message', () => {
    expect(createDeckSchema.parse({ title: '  Từ vựng  ' }).title).toBe('Từ vựng');
    expect(firstMessage(createDeckSchema.safeParse({ title: '   ' }))).toBe(
      'Vui lòng nhập tên bộ thẻ.',
    );
    expect(firstMessage(createDeckSchema.safeParse({ title: 'a'.repeat(101) }))).toBe(
      'Tên bộ thẻ tối đa 100 ký tự.',
    );
  });
  it('requires both sides of a card within the length limits', () => {
    expect(createFlashcardSchema.safeParse({ front: 'Q', back: 'A' }).success).toBe(true);
    expect(firstMessage(createFlashcardSchema.safeParse({ front: '', back: 'A' }))).toBe(
      'Vui lòng nhập mặt trước của thẻ.',
    );
    expect(createFlashcardSchema.safeParse({ front: 'Q', back: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });
  it('rejects unknown keys so schedule fields cannot be set by the client', () => {
    expect(createFlashcardSchema.safeParse({ front: 'Q', back: 'A', dueAt: 'x' }).success).toBe(
      false,
    );
    expect(patchFlashcardSchema.safeParse({ intervalDays: 99 }).success).toBe(false);
  });
  it('allows moving a card with a uuid deckId only', () => {
    expect(
      patchFlashcardSchema.safeParse({ deckId: '0d7b3d5c-3b1e-4a56-8d65-9a3b7c0f1e22' }).success,
    ).toBe(true);
    expect(patchFlashcardSchema.safeParse({ deckId: 'abc' }).success).toBe(false);
  });
});
