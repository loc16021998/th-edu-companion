import "server-only";
import { SUBJECTS, SUBJECT_CRITERIA, type SubjectKey } from "@/config/constants";
import { addDays, addMonths, dayMonth, endOfMonth, startOfMonth, startOfWeek } from "@/lib/date";
import { listAttendanceBetween } from "@/features/attendance/queries";
import { listDailyReportsBetween } from "@/features/daily-reports/queries";

const MONTHS = 6;
const WEEKS = 12;

export type AttendanceMonth = { month: string; label: string; present: number; late: number; absent: number; excused: number; rate: number | null };
export type WeeklyPoint = { week: string; label: string } & Record<string, number | string | null>;
export type CriterionStat = { key: string; label: string; avg: number | null; prevAvg: number | null; count: number };
export type SubjectProgress = {
  key: SubjectKey;
  name: string;
  criteria: { key: string; label: string }[];
  /** Trung bình theo tuần: mỗi tiêu chí + "overall" (điểm chung của môn) */
  weekly: WeeklyPoint[];
  /** Tháng đang xem so với tháng trước */
  month: CriterionStat[];
  overall: { avg: number | null; prevAvg: number | null };
};
export type StudentProgress = {
  monthStart: string;
  monthEnd: string;
  attendance: AttendanceMonth[];
  subjects: SubjectProgress[];
  reportsInMonth: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** "2026-10" → "T10/26" */
function monthLabel(iso: string) {
  return `T${Number(iso.slice(5, 7))}/${iso.slice(2, 4)}`;
}

/**
 * Số liệu tiến độ của 1 học sinh (RLS: phụ huynh của bé / giáo viên phụ trách / quản trị).
 * `month`: ngày bất kỳ trong tháng đang xem (YYYY-MM-DD); `today` chặn số liệu tương lai.
 */
export async function getStudentProgress(studentId: string, month: string, today: string): Promise<StudentProgress> {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month) < today ? endOfMonth(month) : today;
  const prevStart = addMonths(monthStart, -1);
  const prevEnd = endOfMonth(prevStart);

  const rangeStart = addMonths(monthStart, -(MONTHS - 1));
  const weeksStart = startOfWeek(addDays(monthEnd, -(WEEKS * 7 - 1)));
  const from = rangeStart < weeksStart ? rangeStart : weeksStart;

  const [attendance, reports] = await Promise.all([
    listAttendanceBetween(studentId, from, monthEnd),
    listDailyReportsBetween(studentId, from, monthEnd),
  ]);

  // ---- Chuyên cần theo tháng (6 tháng tới tháng đang xem)
  const attendanceMonths: AttendanceMonth[] = Array.from({ length: MONTHS }, (_, i) => {
    const m = addMonths(rangeStart, i);
    const rows = attendance.filter((a) => a.date.slice(0, 7) === m.slice(0, 7));
    const present = rows.filter((a) => a.status === "present").length;
    const late = rows.filter((a) => a.status === "late").length;
    const absent = rows.filter((a) => a.status === "absent").length;
    // Nghỉ có phép: hiện riêng, không tính vào tỷ lệ chuyên cần
    const excused = rows.filter((a) => a.status === "absent_with_permission").length;
    const total = present + late + absent;
    return { month: m.slice(0, 7), label: monthLabel(m), present, late, absent, excused, rate: total ? Math.round(((present + late) / total) * 100) : null };
  });

  // ---- Tiến bộ từng môn
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => addDays(weeksStart, i * 7)).filter((w) => w <= monthEnd);
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;

  const subjects: SubjectProgress[] = (Object.keys(SUBJECTS) as SubjectKey[]).map((key) => {
    const criteria = Object.entries(SUBJECT_CRITERIA[key]).map(([ck, label]) => ({ key: ck, label }));
    const entries = reports.map((r) => ({ date: r.date, entry: r.subjects_summary[key] })).filter((x) => x.entry);

    const collect = (a: string, b: string) => {
      const rows = entries.filter((x) => inRange(x.date, a, b));
      return {
        criteria: Object.fromEntries(
          criteria.map((c) => [c.key, rows.flatMap((x) => (typeof x.entry?.criteria[c.key] === "number" ? [x.entry.criteria[c.key] as number] : []))]),
        ) as Record<string, number[]>,
        overall: rows.flatMap((x) => (typeof x.entry?.rating === "number" ? [x.entry.rating] : [])),
      };
    };

    const weekly: WeeklyPoint[] = weekStarts.map((w) => {
      const c = collect(w, addDays(w, 6));
      const point: WeeklyPoint = { week: w, label: dayMonth(w), overall: avg(c.overall) };
      for (const cr of criteria) point[cr.key] = avg(c.criteria[cr.key] ?? []);
      return point;
    });

    const cur = collect(monthStart, monthEnd);
    const prev = collect(prevStart, prevEnd);
    return {
      key,
      name: SUBJECTS[key],
      criteria,
      weekly,
      month: criteria.map((c) => ({
        key: c.key,
        label: c.label,
        avg: avg(cur.criteria[c.key] ?? []),
        prevAvg: avg(prev.criteria[c.key] ?? []),
        count: cur.criteria[c.key]?.length ?? 0,
      })),
      overall: { avg: avg(cur.overall), prevAvg: avg(prev.overall) },
    };
  });

  return {
    monthStart,
    monthEnd,
    attendance: attendanceMonths,
    subjects,
    reportsInMonth: reports.filter((r) => inRange(r.date, monthStart, monthEnd)).length,
  };
}
