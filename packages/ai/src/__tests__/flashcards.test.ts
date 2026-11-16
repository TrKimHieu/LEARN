import { describe, expect, it } from 'vitest';
import { MockLlmProvider } from '../llm/mock';
import { extractJson } from '../llm/provider';
import { FLASHCARD_PROMPT_VERSION, flashcardPrompt } from '../prompts/flashcard';
import { validateFlashcardOutput } from '../validator/flashcards';

const SOURCE =
  'TCP là giao thức hướng kết nối. Nó đảm bảo dữ liệu đến đúng thứ tự. UDP không đảm bảo thứ tự. HTTP chạy trên TCP.';

describe('flashcardPrompt', () => {
  it('names the card limit, the language and the source text', () => {
    const p = flashcardPrompt({ language: 'vi', title: 'Mạng', count: 8, text: SOURCE });
    expect(FLASHCARD_PROMPT_VERSION).toMatch(/^flashcard@/);
    expect(p).toContain('Số thẻ tối đa: 8');
    expect(p).toContain('Mạng');
    expect(p).toContain(SOURCE);
  });
  it('hands the previous validation error back for a retry', () => {
    const p = flashcardPrompt({
      language: 'vi',
      title: 'Mạng',
      count: 5,
      text: SOURCE,
      previousError: 'cards: Required',
    });
    expect(p).toContain('cards: Required');
  });
});

describe('validateFlashcardOutput', () => {
  it('keeps valid cards, trimmed', () => {
    const r = validateFlashcardOutput(
      { cards: [{ front: '  TCP là gì? ', back: ' Giao thức ' }] },
      10,
    );
    expect(r).toEqual({
      ok: true,
      cards: [{ front: 'TCP là gì?', back: 'Giao thức' }],
      dropped: 0,
    });
  });

  it('drops a bad card instead of failing the whole output', () => {
    const r = validateFlashcardOutput(
      {
        cards: [
          { front: 'Hợp lệ', back: 'Có' },
          { front: '', back: 'Trống mặt trước' },
          { front: 'Quá dài', back: 'x'.repeat(1001) },
          { front: 42, back: 'Sai kiểu' },
          'không phải object',
        ],
      },
      10,
    );
    expect(r).toMatchObject({ ok: true, dropped: 4 });
    if (r.ok) expect(r.cards).toEqual([{ front: 'Hợp lệ', back: 'Có' }]);
  });

  it('drops a repeated front, ignoring case and spacing', () => {
    const r = validateFlashcardOutput(
      {
        cards: [
          { front: 'TCP là gì?', back: 'A' },
          { front: ' tcp là GÌ? ', back: 'B' },
        ],
      },
      10,
    );
    expect(r).toMatchObject({ ok: true, dropped: 1 });
    if (r.ok) expect(r.cards).toHaveLength(1);
  });

  it('caps the cards at the requested limit', () => {
    const cards = Array.from({ length: 6 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }));
    const r = validateFlashcardOutput({ cards }, 4);
    expect(r).toMatchObject({ ok: true, dropped: 2 });
    if (r.ok) expect(r.cards.map((c) => c.front)).toEqual(['Q0', 'Q1', 'Q2', 'Q3']);
  });

  it('fails when nothing usable is left, so the job can retry with the reason', () => {
    expect(validateFlashcardOutput({ cards: [{ front: '', back: '' }] }, 5)).toMatchObject({
      ok: false,
    });
    expect(validateFlashcardOutput({ cards: [] }, 5)).toMatchObject({ ok: false });
    expect(validateFlashcardOutput({}, 5)).toMatchObject({ ok: false });
    expect(validateFlashcardOutput('text', 5)).toMatchObject({ ok: false });
  });
});

describe('MockLlmProvider — thẻ ghi nhớ', () => {
  async function cardsFor(text: string, count: number) {
    const prompt = flashcardPrompt({ language: 'vi', title: 'Mạng', count, text });
    const res = await new MockLlmProvider(1200).generate({ prompt });
    const out = validateFlashcardOutput(extractJson(res.text), count);
    if (!out.ok) throw new Error(out.errors.join('; '));
    return out.cards;
  }

  it('makes one card per source sentence, up to the requested limit', async () => {
    const cards = await cardsFor(SOURCE, 3);
    expect(cards).toHaveLength(3);
    // Mỗi mặt sau là một câu của nguồn, không phải cả nguồn.
    for (const c of cards) {
      expect(SOURCE).toContain(c.back);
      expect(c.back.length).toBeLessThan(SOURCE.length);
    }
  });

  it('splits sentences across blank lines and markdown headings', async () => {
    const md = [
      '# Giao thức UDP',
      'UDP không kết nối, nhanh hơn TCP.',
      '## Ghi chú',
      'UDP không bảo đảm đến đích.',
    ].join('\n\n');
    const cards = await cardsFor(md, 5);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    for (const c of cards) expect(c.back.length).toBeLessThan(md.length);
  });

  it('still returns usable cards for a long source with many sentences', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `Câu số ${i} nói về mạng máy tính.`).join(
      ' ',
    );
    const cards = await cardsFor(long, 10);
    expect(cards).toHaveLength(10);
  });
});
