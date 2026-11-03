import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayVN } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { subjectsSummarySchema } from "@/features/daily-reports/schema";
import { analyzeStudent, WINDOW_DAYS, type HomeworkRow, type RiskResult, type StudentWindow } from "./risk";
import { ruleInterventions } from "./interventions";

/** Học sinh mỗi lượt truy vấn: 30 bé × ~26 buổi < 1000 dòng (giới hạn mặc định của Supabase) → không bị cắt dữ liệu. */
const CHUNK = 30;

export type InsightStudent = { id: string; full_name: string; class_name: string; campus: string; parent_id?: string | null };
export type StudentInsight = {
  student: { id: string; fullName: string; childName: string; className: string; campus: string; classKey: string };
  risk: RiskResult;
  /** Gợi ý can thiệp theo quy tắc (luôn có, kể cả khi chưa bật AI) */
  tips: string[];
};

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const vnDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Dữ liệu 30 ngày (điểm danh, sổ liên lạc, bài tập) của nhiều học sinh — RLS: giáo viên chỉ đọc lớp mình, quản trị đọc tất cả.
 * Gom theo nhóm học sinh (không truy vấn từng bé).
 */
export async function loadWindows(students: InsightStudent[], today = todayVN()): Promise<Map<string, StudentWindow>> {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const supabase = await createClient();
  const windows = new Map<string, StudentWindow>(students.map((s) => [s.id, { attendance: [], reports: [], homework: [] }]));
  /** "mã bài|mã bé" → ngày nộp (giờ VN) */
  const submissionIndex = new Map<string, string>();

  await Promise.all(
    chunks(students.map((s) => s.id), CHUNK).map(async (ids) => {
      const [att, rep, subs] = await Promise.all([
        supabase.from("attendance").select("student_id, date, status").in("student_id", ids).gte("date", from).lte("date", today),
        supabase.from("daily_reports").select("student_id, date, mood, subjects_summary, teacher_note").in("student_id", ids).gte("date", from).lte("date", today),
        supabase.from("homework_submissions").select("student_id, assignment_id, submitted_at").in("student_id", ids),
      ]);
      if (att.error || rep.error) throw new Error("Không tải được dữ liệu học tập", { cause: att.error ?? rep.error });
      for (const a of att.data) windows.get(a.student_id)?.attendance.push({ date: a.date, status: a.status });
      for (const r of rep.data) {
        const subjects = subjectsSummarySchema.catch({}).parse(r.subjects_summary);
        windows.get(r.student_id)?.reports.push({
          date: r.date,
          mood: r.mood,
          note: r.teacher_note,
          subjects: Object.fromEntries(Object.entries(subjects).map(([k, v]) => [k, { rating: v?.rating, criteria: v?.criteria ?? {}, comment: v?.comment ?? "" }])),
        });
      }
      // Bài tập: chưa cài module bài tập → bỏ qua phần này, vẫn phân tích chuyên cần + sổ liên lạc
      if (!subs.error) for (const s of subs.data) submissionIndex.set(`${s.assignment_id}|${s.student_id}`, vnDate(s.submitted_at));
    }),
  );

  // Bài tập có hạn nộp trong khung, theo từng lớp
  const { data: assignments, error } = await supabase
    .from("homework_assignments")
    .select("id, campus, class_name, title, subject, due_date")
    .gte("due_date", from)
    .lt("due_date", today)
    .in("class_name", [...new Set(students.map((s) => s.class_name))]);
  if (!error) {
    for (const s of students) {
      const own = assignments.filter((a) => a.campus === s.campus && a.class_name === s.class_name);
      windows.get(s.id)!.homework = own.map(
        (a): HomeworkRow => ({ title: a.title, subject: a.subject, dueDate: a.due_date!, submittedOn: submissionIndex.get(`${a.id}|${s.id}`) ?? null }),
      );
    }
  }
  return windows;
}

export type SavedNotes = {
  intervention?: { content: string; fingerprint: string };
  report360?: { content: string; sentAt: string | null; ai: boolean };
};

/** Gợi ý AI + bản nháp 360° đã lưu (chưa cài bảng → trống). */
export async function listSavedNotes(studentIds: string[]): Promise<Record<string, SavedNotes>> {
  const out: Record<string, SavedNotes> = {};
  if (studentIds.length === 0) return out;
  const supabase = await createClient();
  await Promise.all(
    chunks(studentIds, 100).map(async (ids) => {
      const { data, error } = await supabase.from("student_insight_notes").select("student_id, kind, content, fingerprint, sent_at, ai_generated").in("student_id", ids);
      if (error) return;
      for (const n of data) {
        const entry = (out[n.student_id] ??= {});
        if (n.kind === "intervention") entry.intervention = { content: n.content, fingerprint: n.fingerprint };
        if (n.kind === "report360") entry.report360 = { content: n.content, sentAt: n.sent_at, ai: n.ai_generated };
      }
    }),
  );
  return out;
}

/** Phân tích cả danh sách học sinh → sắp xếp bé cần lưu ý nhất lên đầu. */
export async function getInsights(students: InsightStudent[], today = todayVN()): Promise<StudentInsight[]> {
  if (students.length === 0) return [];
  const windows = await loadWindows(students, today);
  return students
    .map((s) => {
      const risk = analyzeStudent(windows.get(s.id)!, today);
      const childName = givenName(s.full_name);
      return {
        student: { id: s.id, fullName: s.full_name, childName, className: s.class_name, campus: s.campus, classKey: `${s.campus}:${s.class_name}` },
        risk,
        tips: ruleInterventions(childName, risk.signals),
      };
    })
    .sort((a, b) => b.risk.score - a.risk.score || a.student.childName.localeCompare(b.student.childName, "vi"));
}
