import test from 'node:test';
import assert from 'node:assert/strict';

function validateLessonOutput(lesson) {
  if (!lesson || typeof lesson !== 'object') {
    return { valid: false, error: 'LESSON_OBJECT_REQUIRED' };
  }
  if (!lesson.title || typeof lesson.title !== 'string' || lesson.title.trim().length === 0) {
    return { valid: false, error: 'TITLE_REQUIRED' };
  }
  if (!lesson.content || typeof lesson.content !== 'string' || lesson.content.trim().length < 10) {
    return { valid: false, error: 'CONTENT_TOO_SHORT' };
  }
  if (!Array.isArray(lesson.exercises) || lesson.exercises.length === 0) {
    return { valid: false, error: 'EXERCISES_EMPTY' };
  }
  for (const ex of lesson.exercises) {
    if (!ex.prompt || !Array.isArray(ex.options) || ex.options.length < 2) {
      return { valid: false, error: 'INVALID_EXERCISE_STRUCTURE' };
    }
  }
  return { valid: true };
}

function validateDocumentForExtraction(text) {
  if (!text || typeof text !== 'string') return { valid: false, error: 'CONTENT_EMPTY' };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: false, error: 'CONTENT_EMPTY' };
  if (trimmed.length < 20) return { valid: false, error: 'CONTENT_TOO_SHORT_FOR_AI' };
  return { valid: true, length: trimmed.length };
}

test('TC-11 (Unit - DT): Bang quyet dinh kiem tra cau truc bai hoc AI sinh', () => {
  const validLesson = {
    title: 'Bai 1: Tong quan Internet',
    content: 'Internet la he thong thong tin toan cau lien ket cac mang may tinh voi nhau.',
    exercises: [
      { prompt: 'Internet ra doi nam nao?', options: ['1969', '1983', '1995', '2000'] }
    ]
  };
  assert.equal(validateLessonOutput(validLesson).valid, true);

  const missingEx = { ...validLesson, exercises: [] };
  assert.equal(validateLessonOutput(missingEx).error, 'EXERCISES_EMPTY');

  const emptyTitle = { ...validLesson, title: '   ' };
  assert.equal(validateLessonOutput(emptyTitle).error, 'TITLE_REQUIRED');

  const invalidOptions = {
    ...validLesson,
    exercises: [{ prompt: 'Cau hoi?', options: ['Phuong an 1'] }]
  };
  assert.equal(validateLessonOutput(invalidOptions).error, 'INVALID_EXERCISE_STRUCTURE');
});

test('TC-12 (Unit - BVA): Phan tich gia tri bien do dai van ban nguon dua vao AI', () => {
  assert.equal(validateDocumentForExtraction('').error, 'CONTENT_EMPTY');
  assert.equal(validateDocumentForExtraction('   ').error, 'CONTENT_EMPTY');
  assert.equal(validateDocumentForExtraction('Chi co 19 ky tu ne!').error, 'CONTENT_TOO_SHORT_FOR_AI');
  assert.equal(validateDocumentForExtraction('12345678901234567890').valid, true);
});
