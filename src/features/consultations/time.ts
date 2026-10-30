// Hàm thuần (server + client) cho lịch hẹn trao đổi: giờ Việt Nam, chia ô, kiểm tra trùng khung, file lịch .ics.
import { weekdayShort } from "@/lib/date";

const TZ = "Asia/Ho_Chi_Minh";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam của 1 thời điểm. */
export const vnDate = (iso: string) => dayFmt.format(new Date(iso));
/** "16:30" theo giờ Việt Nam. */
export const vnTime = (iso: string) => timeFmt.format(new Date(iso));

/** "T7 31/10 · 16:00–16:30" */
export function slotLabel(startsAt: string, endsAt: string): string {
  const d = vnDate(startsAt);
  return `${weekdayShort(d)} ${d.slice(8, 10)}/${d.slice(5, 7)} · ${vnTime(startsAt)}–${vnTime(endsAt)}`;
}

/** "16:30" → 990 phút; chuỗi sai định dạng → NaN. */
export function minutesOf(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::\d\d)?$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** Số ô trọn vẹn trong khung giờ (16:00–17:30, 30 phút → 3). */
export function slotCount(start: string, end: string, slotMinutes: number): number {
  const span = minutesOf(end) - minutesOf(start);
  return span > 0 && slotMinutes > 0 ? Math.floor(span / slotMinutes) : 0;
}

export type Window = { id?: string; weekday: number; start: string; end: string };

/** Khung giờ mới có chồng lên khung đã có (cùng thứ) không — bỏ qua chính nó khi sửa. */
export function overlapsExisting(next: Window, existing: readonly Window[]): Window | null {
  const a0 = minutesOf(next.start);
  const a1 = minutesOf(next.end);
  return existing.find((w) => w.id !== next.id && w.weekday === next.weekday && minutesOf(w.start) < a1 && minutesOf(w.end) > a0) ?? null;
}

export type Slot = { startsAt: string; endsAt: string; mode: string; available: boolean };

/** Nhóm ô giờ theo ngày (giờ VN), giữ thứ tự thời gian. */
export function groupSlotsByDay(slots: readonly Slot[]): { date: string; slots: Slot[]; free: number }[] {
  const days = new Map<string, Slot[]>();
  for (const s of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const d = vnDate(s.startsAt);
    days.set(d, [...(days.get(d) ?? []), s]);
  }
  return [...days.entries()].map(([date, list]) => ({ date, slots: list, free: list.filter((s) => s.available).length }));
}

/** "còn 25 phút" / "còn 2 giờ 5 phút" / null khi đã qua. */
export function startsIn(startsAt: string, now: number = Date.now()): string | null {
  const min = Math.ceil((new Date(startsAt).getTime() - now) / 60_000);
  if (min <= 0) return null;
  if (min < 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h >= 24 ? null : `còn ${h} giờ${m ? ` ${m} phút` : ""}`;
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** File lịch .ics (Google Calendar, Lịch iPhone…) cho 1 lịch hẹn — kèm nhắc trước 30 phút. */
export function bookingIcs(b: { id: string; startsAt: string; endsAt: string; title: string; description: string; location?: string | null; url?: string | null }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TH EDU//Lich hen//VI",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@thedu`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(b.startsAt)}`,
    `DTEND:${icsStamp(b.endsAt)}`,
    `SUMMARY:${icsText(b.title)}`,
    `DESCRIPTION:${icsText(b.description)}`,
    ...(b.location ? [`LOCATION:${icsText(b.location)}`] : []),
    ...(b.url ? [`URL:${b.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(b.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
