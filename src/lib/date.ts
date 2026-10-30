// Ngày "thuần" dạng YYYY-MM-DD (khớp cột `date` trong DB).
// Mọi phép tính dùng UTC để không bị lệch ngày do múi giờ của server/trình duyệt.

const TZ = "Asia/Ho_Chi_Minh";
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Hợp lệ cả về định dạng lẫn ngày thật (loại 2026-02-30). */
export function isISODate(value: unknown): value is string {
  return typeof value === "string" && ISO_RE.test(value) && toISO(toDate(value)) === value;
}

/** Hôm nay theo giờ Việt Nam. */
export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = toDate(iso);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function addMonths(iso: string, months: number): string {
  const d = toDate(iso);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

/** Thứ Hai đầu tuần (tuần Việt Nam bắt đầu từ Thứ Hai). */
export function startOfWeek(iso: string): string {
  const dow = (toDate(iso).getUTCDay() + 6) % 7; // 0 = Thứ Hai
  return addDays(iso, -dow);
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

// Định dạng tự viết thay vì Intl "vi-VN": ICU cho kết quả không nhất quán
// (vd. {day, month} → "19-10" nhưng {day, month, year} → "19/10/2026").
const WEEKDAY_LONG = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function weekdayLong(iso: string): string {
  return WEEKDAY_LONG[toDate(iso).getUTCDay()]!;
}

export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[toDate(iso).getUTCDay()]!;
}

/** "19/10" */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "19/10/2026" */
export function fullDate(iso: string): string {
  return `${dayMonth(iso)}/${iso.slice(0, 4)}`;
}

/** "Hôm nay" / "Hôm qua" / "Thứ Hai, 20/10". */
export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return "Hôm nay";
  if (iso === addDays(today, -1)) return "Hôm qua";
  return `${weekdayLong(iso)}, ${dayMonth(iso)}`;
}

export function ageFrom(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
