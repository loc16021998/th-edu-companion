import "server-only";
import { MOOD_LABELS, SUBJECTS, SUBJECT_CRITERIA, type SubjectKey } from "@/config/constants";
import { addDays, endOfMonth, fullDate, startOfMonth } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { listAttendanceBetween } from "@/features/attendance/queries";
import { listDailyReportsBetween } from "@/features/daily-reports/queries";
import type { Enums } from "@/types/database.types";

export type MonthData = {
  childName: string;
  className: string;
  from: string;
  to: string;
  monthStart: string;
  attendance: { present: number; late: number; absent: number; excused: number; absentNotes: string[] };
  moods: Partial<Record<Enums<"mood">, number>>;
  subjects: {
    key: SubjectKey;
    name: string;
    avg: number | null;
    criteria: { label: string; avg: number | null }[];
    comments: string[];
  }[];
  teacherNotes: { date: string; note: string }[];
  reportCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const clip = (t: string, max: number) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Khoảng tổng kết: 30 ngày kết thúc ở cuối tháng đang chọn (hoặc hôm nay nếu tháng chưa hết).
 * `month`: ngày bất kỳ trong tháng.
 */
export function summaryRange(month: string, today: string) {
  const monthStart = startOfMonth(month);
  const to = endOfMonth(month) < today ? endOfMonth(month) : today;
  return { monthStart, from: addDays(to, -29), to };
}

/** Gom điểm danh + sổ liên lạc 30 ngày của 1 học sinh (RLS giới hạn theo quyền người gọi). */
export async function collectMonthData(
  student: { id: string; full_name: string; class_name: string },
  month: string,
  today: string,
): Promise<MonthData> {
  const { monthStart, from, to } = summaryRange(month, today);
  const [attendance, reports] = await Promise.all([
    listAttendanceBetween(student.id, from, to),
    listDailyReportsBetween(student.id, from, to),
  ]);

  const moods: MonthData["moods"] = {};
  for (const r of reports) if (r.mood) moods[r.mood] = (moods[r.mood] ?? 0) + 1;

  const subjects = (Object.keys(SUBJECTS) as SubjectKey[]).map((key) => {
    const entries = reports.flatMap((r) => (r.subjects_summary[key] ? [r.subjects_summary[key]] : []));
    return {
      key,
      name: SUBJECTS[key],
      avg: avg(entries.flatMap((e) => (typeof e.rating === "number" ? [e.rating] : []))),
      criteria: Object.entries(SUBJECT_CRITERIA[key]).map(([ck, label]) => ({
        label,
        avg: avg(entries.flatMap((e) => (typeof e.criteria[ck] === "number" ? [e.criteria[ck] as number] : []))),
      })),
      comments: entries.map((e) => e.comment).filter((c) => c.trim()).slice(-6).map((c) => clip(c, 160)),
    };
  });

  return {
    childName: givenName(student.full_name),
    className: student.class_name,
    from,
    to,
    monthStart,
    attendance: {
      present: attendance.filter((a) => a.status === "present").length,
      late: attendance.filter((a) => a.status === "late").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      excused: attendance.filter((a) => a.status === "absent_with_permission").length,
      absentNotes: attendance.filter((a) => a.status !== "present" && a.note).map((a) => `${fullDate(a.date)}: ${clip(a.note ?? "", 80)}`),
    },
    moods,
    subjects,
    teacherNotes: reports
      .filter((r) => r.teacher_note?.trim())
      .slice(-10)
      .map((r) => ({ date: r.date, note: clip(r.teacher_note ?? "", 220) })),
    reportCount: reports.length,
  };
}

/** Dữ liệu dạng văn bản ngắn gọn để đưa cho AI. */
export function monthDataToText(d: MonthData): string {
  const lines = [
    `Học sinh: bé ${d.childName}, lớp ${d.className}. Khoảng tổng kết: ${fullDate(d.from)} – ${fullDate(d.to)} (30 ngày).`,
    `Chuyên cần: ${d.attendance.present} buổi có mặt, ${d.attendance.late} buổi đi muộn, ${d.attendance.absent} buổi nghỉ${d.attendance.excused ? `, ${d.attendance.excused} buổi nghỉ có phép (đã xin phép)` : ""}.`,
    ...d.attendance.absentNotes.map((n) => `  - ${n}`),
    `Số buổi có sổ liên lạc: ${d.reportCount}.`,
    `Tâm trạng ở lớp: ${
      Object.entries(d.moods)
        .map(([m, n]) => `${MOOD_LABELS[m as Enums<"mood">]} ${n} buổi`)
        .join(", ") || "chưa ghi nhận"
    }.`,
  ];
  for (const s of d.subjects) {
    lines.push(`Môn ${s.name}: điểm chung trung bình ${s.avg ?? "chưa có"}/5.`);
    for (const c of s.criteria) lines.push(`  - ${c.label}: ${c.avg ?? "chưa đánh giá"}${c.avg !== null ? "/5" : ""}`);
    if (s.comments.length) lines.push(`  Nhận xét của giáo viên: ${s.comments.join(" | ")}`);
  }
  if (d.teacherNotes.length) {
    lines.push("Nhận xét chung theo buổi:");
    for (const n of d.teacherNotes) lines.push(`  - ${fullDate(n.date)}: ${n.note}`);
  }
  return lines.join("\n");
}
