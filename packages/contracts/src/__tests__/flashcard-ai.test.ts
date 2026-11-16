import { describe, expect, it } from 'vitest';
import {
  acceptFlashcardDraftsSchema,
  generateFlashcardsSchema,
  patchFlashcardDraftSchema,
} from '../flashcard';

const id = '0d7b3d5c-3b1e-4a56-8d65-9a3b7c0f1e22';
const id2 = '5e1c8f0a-3b1e-4a56-8d65-9a3b7c0f1e23';

describe('generateFlashcardsSchema', () => {
  it('takes exactly one source and defaults the count to 10', () => {
    expect(generateFlashcardsSchema.parse({ lessonId: id })).toEqual({ lessonId: id, count: 10 });
    expect(generateFlashcardsSchema.parse({ documentId: id, count: 5 }).count).toBe(5);
  });
  it('rejects no source, two sources, a bad count and unknown keys', () => {
    expect(generateFlashcardsSchema.safeParse({}).success).toBe(false);
    expect(generateFlashcardsSchema.safeParse({ lessonId: id, documentId: id2 }).success).toBe(
      false,
    );
    expect(generateFlashcardsSchema.safeParse({ lessonId: id, count: 0 }).success).toBe(false);
    expect(generateFlashcardsSchema.safeParse({ lessonId: id, count: 31 }).success).toBe(false);
    expect(generateFlashcardsSchema.safeParse({ lessonId: id, model: 'x' }).success).toBe(false);
  });
});

describe('acceptFlashcardDraftsSchema', () => {
  it('needs one target: an existing deck or a new deck title', () => {
    expect(acceptFlashcardDraftsSchema.safeParse({ draftIds: [id], deckId: id2 }).success).toBe(
      true,
    );
    expect(
      acceptFlashcardDraftsSchema.safeParse({ draftIds: [id], newDeckTitle: 'Bộ mới' }).success,
    ).toBe(true);
    expect(acceptFlashcardDraftsSchema.safeParse({ draftIds: [id] }).success).toBe(false);
    expect(
      acceptFlashcardDraftsSchema.safeParse({ draftIds: [id], deckId: id2, newDeckTitle: 'x' })
        .success,
    ).toBe(false);
  });
  it('bounds the draft list from 1 to 100', () => {
    expect(acceptFlashcardDraftsSchema.safeParse({ draftIds: [], deckId: id }).success).toBe(false);
    const many = Array.from({ length: 101 }, () => id);
    expect(acceptFlashcardDraftsSchema.safeParse({ draftIds: many, deckId: id2 }).success).toBe(
      false,
    );
  });
});

describe('patchFlashcardDraftSchema', () => {
  it('reuses the card limits and Vietnamese messages', () => {
    const r = patchFlashcardDraftSchema.safeParse({ front: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Vui lòng nhập mặt trước của thẻ.');
    expect(patchFlashcardDraftSchema.safeParse({ back: 'ok' }).success).toBe(true);
  });
});
