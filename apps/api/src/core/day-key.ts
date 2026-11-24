/** Ngày lịch của `d` tại `timeZone`, dạng `YYYY-MM-DD`. `en-CA` cho sẵn đúng định dạng đó. */
export function localDayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Đọc ngày từ một Date mà các thành phần UTC của nó đã là ngày địa phương. */
export function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Lùi một ngày lịch. Làm trên chuỗi `YYYY-MM-DD` qua `Date.UTC` nên không dính giờ mùa hè:
 * ở múi giờ có DST, "24 tiếng trước" có thể vẫn là cùng ngày hoặc nhảy hai ngày.
 */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return utcDayKey(prev);
}
