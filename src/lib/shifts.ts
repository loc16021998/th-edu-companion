// Ca học do quản trị viên tạo (bảng class_shifts). Module thuần — dùng được ở server và client.
// Lớp chưa gán ca → dùng lịch mặc định trong lib/schedule (Thứ 2 – Thứ 7, 18:00 – 19:30).
import { addDays, toDate } from "@/lib/date";
import { SESSION_END, SESSION_START } from "@/lib/schedule";

/** Ngày trong tuần theo ISO: 1 = Thứ 2 … 7 = Chủ nhật. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShiftLike = { name: string; start_time: string; end_time: string; weekdays: number[] };

export const WEEKDAY_OPTIONS: { value: IsoWeekday; short: string; long: string }[] = [
  { value: 1, short: "T2", long: "Thứ 2" },
  { value: 2, short: "T3", long: "Thứ 3" },
  { value: 3, short: "T4", long: "Thứ 4" },
  { value: 4, short: "T5", long: "Thứ 5" },
  { value: 5, short: "T6", long: "Thứ 6" },
  { value: 6, short: "T7", long: "Thứ 7" },
  { value: 7, short: "CN", long: "Chủ nhật" },
];

/** Ca mặc định khi lớp chưa được gán ca. */
export const DEFAULT_SHIFT: ShiftLike = {
  name: "Lịch mặc định",
  start_time: SESSION_START,
  end_time: SESSION_END,
  weekdays: [1, 2, 3, 4, 5, 6],
};

/** "18:00:00" → "18:00" */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function shiftTimeLabel(shift: Pick<ShiftLike, "start_time" | "end_time">): string {
  return `${hhmm(shift.start_time)} – ${hhmm(shift.end_time)}`;
}

/** [1..6] → "Thứ 2 – Thứ 7"; [1,3,5] → "T2, T4, T6"; đủ 7 ngày → "Cả tuần". */
export function weekdaysLabel(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return "Cả tuần";
  const first = days[0];
  const last = days[days.length - 1];
  const contiguous = first !== undefined && last !== undefined && last - first + 1 === days.length;
  if (contiguous && days.length >= 3) {
    return `${WEEKDAY_OPTIONS[first - 1]?.long} – ${WEEKDAY_OPTIONS[last - 1]?.long}`;
  }
  return days.map((d) => WEEKDAY_OPTIONS[d - 1]?.short).join(", ");
}

export function shiftScheduleLabel(shift: ShiftLike): string {
  return `${weekdaysLabel(shift.weekdays)} · ${shiftTimeLabel(shift)}`;
}

export function isoWeekday(iso: string): IsoWeekday {
  const d = toDate(iso).getUTCDay();
  return (d === 0 ? 7 : d) as IsoWeekday;
}

/** Ngày `iso` có buổi học theo ca không. */
export function isShiftDay(iso: string, shift: Pick<ShiftLike, "weekdays">): boolean {
  return shift.weekdays.includes(isoWeekday(iso));
}

const minuteFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export type ShiftPhase = "off" | "upcoming" | "in_progress" | "finished";

export function shiftPhase(today: string, shift: ShiftLike, now: Date = new Date()): ShiftPhase {
  if (!isShiftDay(today, shift)) return "off";
  const current = toMinutes(minuteFmt.format(now));
  if (current < toMinutes(shift.start_time)) return "upcoming";
  if (current < toMinutes(shift.end_time)) return "in_progress";
  return "finished";
}

/** Buổi học kế tiếp theo ca: hôm nay nếu buổi chưa kết thúc, ngược lại ngày học kế tiếp (tối đa 7 ngày). */
export function nextShiftDate(today: string, shift: ShiftLike, now: Date = new Date()): string {
  const phase = shiftPhase(today, shift, now);
  if (phase === "upcoming" || phase === "in_progress") return today;
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    if (isShiftDay(day, shift)) return day;
  }
  return today;
}
