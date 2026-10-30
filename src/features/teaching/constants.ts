// Lịch dạy · chấm công theo ca · lương theo buổi. Module thuần — dùng chung server + client.
import { CAMPUS_LABELS } from "@/config/constants";
import { DEFAULT_SHIFT, isShiftDay, type ShiftLike } from "@/lib/shifts";
import type { Enums } from "@/types/database.types";

/** Môn tính lương: 3 môn + "Tổng hợp" (lớp chưa đặt môn). */
export const PAY_SUBJECTS = {
  tien_tieu_hoc: "Tiền tiểu học",
  luyen_chu: "Luyện chữ đẹp",
  toan_tu_duy: "Toán tư duy",
  tong_hop: "Tổng hợp",
} as const;
export type PaySubject = keyof typeof PAY_SUBJECTS;
export const PAY_SUBJECT_KEYS = Object.keys(PAY_SUBJECTS) as PaySubject[];

export const SUBJECT_TONE: Record<PaySubject, string> = {
  tien_tieu_hoc: "bg-sky-50 text-sky-800 ring-sky-200",
  luyen_chu: "bg-edu-leaf-50 text-edu-leaf-800 ring-edu-leaf-200",
  toan_tu_duy: "bg-edu-peach-50 text-edu-peach-800 ring-edu-peach-200",
  tong_hop: "bg-slate-50 text-slate-700 ring-slate-200",
};

export const subjectLabel = (s: string | null | undefined) => PAY_SUBJECTS[(s ?? "tong_hop") as PaySubject] ?? "Tổng hợp";

export const SESSION_STATUS = {
  in_progress: { label: "Đang dạy", badge: "bg-sky-50 text-sky-700 ring-sky-200" },
  completed: { label: "Đã dạy", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  missed_checkout: { label: "Quên kết thúc ca", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  manual: { label: "Quản trị ghi nhận", badge: "bg-violet-50 text-violet-700 ring-violet-200" },
  cancelled: { label: "Đã huỷ", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const;
export type SessionStatus = keyof typeof SESSION_STATUS;

/** Ca được tính lương. "Quên kết thúc ca" vẫn tính (đã bắt đầu dạy) nhưng được đánh dấu để quản trị viên xem lại. */
export const PAID_STATUSES: readonly string[] = ["completed", "missed_checkout", "manual"];

/** "201" / "P.201" / "Phòng 201" → "P.201" */
export const roomLabel = (room: string) => `P.${room.trim().replace(/^(phòng|p\.?)\s*/iu, "")}`;

export const campusShort = (c: Enums<"campus">) => (c === "CS1_XALA" ? "CS1 Xa La" : "CS2 Ngô Thì Nhậm");
export { CAMPUS_LABELS };

// ----------------------------------------------------------------------------- Lịch dạy

export type ScheduleClass = {
  id: string;
  campus: Enums<"campus">;
  name: string;
  subject: string | null;
  room: string | null;
  shift: ShiftLike;
  /** Có ca riêng (false = lịch mặc định) */
  hasShift: boolean;
  students: { id: string; full_name: string }[];
};

export type SessionRecord = {
  id: string;
  class_id: string | null;
  class_name: string;
  campus: Enums<"campus">;
  subject: string;
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  status: string;
  off_schedule: boolean;
  rate: number | null;
  note: string | null;
};

/** 1 buổi dạy trên lịch: theo ca của lớp, kèm bản ghi chấm công (nếu có). Ca dạy bù ngoài lịch cũng hiện. */
export type Occurrence = {
  key: string;
  date: string;
  start: string;
  end: string;
  classId: string | null;
  className: string;
  campus: Enums<"campus">;
  subject: string;
  room: string | null;
  session: SessionRecord | null;
};

export function buildOccurrences(days: string[], classes: ScheduleClass[], sessions: SessionRecord[]): Occurrence[] {
  const out: Occurrence[] = [];
  const used = new Set<string>();
  const byKey = new Map(sessions.filter((s) => s.status !== "cancelled").map((s) => [`${s.class_id}:${s.date}`, s]));
  for (const day of days) {
    for (const c of classes) {
      if (!isShiftDay(day, c.shift)) continue;
      const session = byKey.get(`${c.id}:${day}`) ?? null;
      if (session) used.add(session.id);
      out.push({
        key: `${c.id}:${day}`,
        date: day,
        start: c.shift.start_time.slice(0, 5),
        end: c.shift.end_time.slice(0, 5),
        classId: c.id,
        className: c.name,
        campus: c.campus,
        subject: c.subject ?? "tong_hop",
        room: c.room,
        session,
      });
    }
  }
  // Ca ngoài lịch (dạy bù / dạy thay lớp khác)
  for (const s of sessions) {
    if (used.has(s.id) || s.status === "cancelled" || !days.includes(s.date)) continue;
    const cls = classes.find((c) => c.id === s.class_id);
    out.push({
      key: `${s.class_id}:${s.date}:${s.id}`,
      date: s.date,
      start: (s.scheduled_start ?? "00:00").slice(0, 5),
      end: (s.scheduled_end ?? "00:00").slice(0, 5),
      classId: s.class_id,
      className: s.class_name,
      campus: s.campus,
      subject: s.subject,
      room: cls?.room ?? null,
      session: s,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export { DEFAULT_SHIFT };

// ----------------------------------------------------------------------------- Lương

export type RateRow = { subject: string; teacher_id: string | null; rate: number };

/** Đơn giá hiệu lực: riêng giáo viên > mặc định môn > mặc định "Tổng hợp" (khớp teaching_rate_for trong DB). */
export function effectiveRate(rates: RateRow[], teacherId: string, subject: string): number | null {
  const pick = (s: string, t: string | null) => rates.find((r) => r.subject === s && r.teacher_id === t)?.rate;
  return pick(subject, teacherId) ?? pick("tong_hop", teacherId) ?? pick(subject, null) ?? pick("tong_hop", null) ?? null;
}

export type PayrollLine = { subject: PaySubject; sessions: number; rate: number | null; amount: number; missingRate: boolean };
export type PayrollRow = {
  teacherId: string;
  teacherName: string;
  phone: string | null;
  campus: Enums<"campus"> | null;
  lines: PayrollLine[];
  sessions: number;
  amount: number;
  /** Ca cần xem lại: quên kết thúc ca / ngoài lịch / đang mở */
  flagged: number;
  missingRate: boolean;
};

/**
 * Lương tháng = Σ (số ca hợp lệ × đơn giá buổi). Đơn giá: chốt trên ca khi kết thúc; ca chưa chốt → đơn giá hiện hành.
 * Ca có đơn giá khác nhau trong cùng môn (đổi đơn giá giữa tháng) → tách dòng theo đơn giá.
 */
export function computePayroll(
  teachers: { id: string; full_name: string; phone: string | null; campus: Enums<"campus"> | null }[],
  sessions: (SessionRecord & { teacher_id: string })[],
  rates: RateRow[],
): PayrollRow[] {
  return teachers
    .map((t) => {
      const mine = sessions.filter((s) => s.teacher_id === t.id);
      const paid = mine.filter((s) => PAID_STATUSES.includes(s.status));
      const groups = new Map<string, PayrollLine>();
      for (const s of paid) {
        const subject = (s.subject in PAY_SUBJECTS ? s.subject : "tong_hop") as PaySubject;
        const rate = s.rate ?? effectiveRate(rates, t.id, subject);
        const key = `${subject}:${rate ?? "none"}`;
        const line = groups.get(key) ?? { subject, sessions: 0, rate, amount: 0, missingRate: rate === null };
        line.sessions += 1;
        line.amount += rate ?? 0;
        groups.set(key, line);
      }
      const lines = [...groups.values()].sort((a, b) => PAY_SUBJECT_KEYS.indexOf(a.subject) - PAY_SUBJECT_KEYS.indexOf(b.subject));
      return {
        teacherId: t.id,
        teacherName: t.full_name,
        phone: t.phone,
        campus: t.campus,
        lines,
        sessions: paid.length,
        amount: lines.reduce((sum, l) => sum + l.amount, 0),
        flagged: mine.filter((s) => s.status === "missed_checkout" || s.status === "in_progress" || (s.off_schedule && s.status !== "cancelled")).length,
        missingRate: lines.some((l) => l.missingRate),
      };
    })
    .sort((a, b) => b.amount - a.amount || a.teacherName.localeCompare(b.teacherName, "vi"));
}

/** "2026-10" ↔ ngày đầu / cuối tháng. */
export function monthRange(month: string) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, "0")}` };
}
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const monthLabel = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
/** ISO → "18:02" giờ Việt Nam */
export const clock = (iso: string | null) => (iso ? hm.format(new Date(iso)) : "—");
/** Số phút dạy thực tế */
export function minutesBetween(a: string | null, b: string | null) {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}
