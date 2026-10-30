// Lịch học cố định của trung tâm: Thứ 2 → Thứ 7, mỗi buổi 18:00 – 19:30 (giờ Việt Nam).
// Module thuần — dùng được ở server, client và trong zod schema.
import { addDays, toDate } from "@/lib/date";

export const SESSION_START = "18:00";
export const SESSION_END = "19:30";
export const SESSION_LABEL = `${SESSION_START} – ${SESSION_END}`;
export const SCHOOL_DAYS_LABEL = "Thứ 2 – Thứ 7";
export const SCHEDULE_LABEL = `${SCHOOL_DAYS_LABEL} · ${SESSION_LABEL}`;

/** Có buổi học vào ngày này không (Chủ nhật nghỉ). */
export function isSchoolDay(iso: string): boolean {
  return toDate(iso).getUTCDay() !== 0;
}

/** Ngày học gần nhất ≤ `iso` (Chủ nhật → Thứ 7 liền trước). */
export function latestSchoolDay(iso: string): string {
  return isSchoolDay(iso) ? iso : addDays(iso, -1);
}

export type SessionPhase = "off" | "upcoming" | "in_progress" | "finished";

const minuteFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Trạng thái buổi học của ngày `today` tại thời điểm `now` (giờ VN). */
export function sessionPhase(today: string, now: Date = new Date()): SessionPhase {
  if (!isSchoolDay(today)) return "off";
  const current = toMinutes(minuteFmt.format(now));
  if (current < toMinutes(SESSION_START)) return "upcoming";
  if (current < toMinutes(SESSION_END)) return "in_progress";
  return "finished";
}

/**
 * Buổi học kế tiếp tính từ thời điểm `now`: hôm nay nếu buổi chưa kết thúc, ngược lại ngày học kế tiếp.
 * Trả về ngày YYYY-MM-DD.
 */
export function nextSessionDate(today: string, now: Date = new Date()): string {
  const phase = sessionPhase(today, now);
  if (phase === "upcoming" || phase === "in_progress") return today;
  let day = addDays(today, 1);
  while (!isSchoolDay(day)) day = addDays(day, 1);
  return day;
}

export const SESSION_PHASE_LABEL: Record<SessionPhase, string> = {
  off: "Chủ nhật — nghỉ học",
  upcoming: `Buổi học bắt đầu lúc ${SESSION_START}`,
  in_progress: `Đang học · kết thúc ${SESSION_END}`,
  finished: "Buổi học hôm nay đã kết thúc",
};
