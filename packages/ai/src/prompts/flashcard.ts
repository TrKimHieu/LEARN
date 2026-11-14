export const FLASHCARD_PROMPT_VERSION = 'flashcard@1';

/** Dấu nhận biết prompt sinh thẻ; mock provider dựa vào đây để trả đúng dạng. */
export const FLASHCARD_MARKER = '[[SINH THẺ GHI NHỚ]]';

export interface FlashcardPromptCtx {
  language: 'vi' | 'en';
  title: string;
  /** Số thẻ tối đa muốn nhận. */
  count: number;
  /** Nội dung nguồn (bài học hoặc các đoạn tài liệu đã trích xuất). */
  text: string;
  /** Lý do lượt trước không dùng được, để mô hình sửa. */
  previousError?: string;
}

/** Prompt sinh thẻ ghi nhớ (mặt trước/mặt sau) từ một nguồn học tập. */
export function flashcardPrompt(ctx: FlashcardPromptCtx): string {
  const lines = [
    FLASHCARD_MARKER,
    `Bạn tạo thẻ ghi nhớ để ôn tập theo đường cong quên, từ nội dung nguồn "${ctx.title}".`,
    `Ngôn ngữ thẻ: ${ctx.language === 'vi' ? 'tiếng Việt' : 'English'}.`,
    `Số thẻ tối đa: ${ctx.count}.`,
    'Mỗi thẻ có "front" (câu hỏi hoặc khái niệm, ngắn gọn, tối đa 500 ký tự) và "back" (đáp án hoặc',
    'giải thích, tối đa 1000 ký tự). Chỉ dùng thông tin có trong nguồn, mỗi thẻ một ý, không trùng nhau.',
    '',
    '---- NỘI DUNG NGUỒN ----',
    ctx.text,
    '---- HẾT NGUỒN ----',
    '',
  ];
  if (ctx.previousError) {
    lines.push(`Lượt trước không dùng được vì: ${ctx.previousError}. Hãy sửa lỗi này.`, '');
  }
  lines.push(
    'Trả về DUY NHẤT một object JSON dạng {"cards":[{"front":"...","back":"..."}]}, không thêm chữ nào khác.',
  );
  return lines.join('\n');
}
