/** Lỗi nghiệp vụ của một job AI, có `code` ổn định để API và web hiển thị đúng thông điệp. */
export class JobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

/** Job đã bị huỷ (status CANCELLED đặt từ nơi khác); processor dừng ở điểm kiểm tra gần nhất. */
export class JobCancelledError extends JobError {
  constructor() {
    super('CANCELLED_BY_USER', 'Job đã được huỷ theo yêu cầu người dùng.');
    this.name = 'JobCancelledError';
  }
}
