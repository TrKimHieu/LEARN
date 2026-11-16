import { describe, expect, it } from 'vitest';
import { submitFeedbackSchema } from '../feedback';

const lessonId = '0d7b3d5c-3b1e-4a56-8d65-9a3b7c0f1e22';

describe('submitFeedbackSchema', () => {
  it('accepts one to three distinct questions scored 1 to 5', () => {
    const ok = submitFeedbackSchema.safeParse({
      topic: 'LESSON',
      subjectId: lessonId,
      answers: [
        { question: 'QUALITY', score: 5 },
        { question: 'UNDERSTANDING', score: 3 },
      ],
      comment: '  Hay  ',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.comment).toBe('Hay');
  });

  it('rejects out-of-range scores, unknown topics, repeated questions and extra keys', () => {
    const base = { topic: 'POMODORO', answers: [{ question: 'USEFULNESS', score: 4 }] };
    expect(submitFeedbackSchema.safeParse(base).success).toBe(true);
    const bad = [
      { ...base, answers: [{ question: 'USEFULNESS', score: 6 }] },
      { ...base, answers: [{ question: 'USEFULNESS', score: 0 }] },
      { ...base, answers: [{ question: 'USEFULNESS', score: 2.5 }] },
      { ...base, topic: 'CHAT' },
      { ...base, answers: [] },
      {
        ...base,
        answers: [
          { question: 'USEFULNESS', score: 4 },
          { question: 'USEFULNESS', score: 5 },
        ],
      },
      { ...base, userId: lessonId },
      { ...base, comment: 'x'.repeat(501) },
    ];
    for (const b of bad) expect(submitFeedbackSchema.safeParse(b).success).toBe(false);
  });
});
