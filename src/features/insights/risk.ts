/**
 * Cảnh báo sớm tiến độ học tập — QUY TẮC rõ ràng (không dùng AI): mỗi cảnh báo kèm số liệu cụ thể để giáo viên kiểm chứng.
 * Module thuần (không gọi mạng) — dùng ở server và trong unit test.
 *
 * Khung 30 ngày, chia "gần đây" (14 ngày cuối) và "trước đó" (16 ngày đầu) để xem xu hướng.
 */
import { SUBJECTS, SUBJECT_CRITERIA, type SubjectKey } from "@/config/constants";
import { addDays, dayMonth } from "@/lib/date";

export const WINDOW_DAYS = 30;
export const RECENT_DAYS = 14;

export type AttendanceRow = { date: string; status: "present" | "late" | "absent" | "absent_with_permission" };
export type ReportRow = {
  date: string;
  mood: string | null;
  subjects: Partial<Record<SubjectKey, { rating?: number; criteria: Record<string, number>; comment: string }>>;
  note: string | null;
};
/** Bài có hạn nộp trong khung (đã qua hạn); `submittedOn`: ngày nộp (giờ VN) hoặc null nếu chưa nộp */
export type HomeworkRow = { title: string; subject: string | null; dueDate: string; submittedOn: string | null };
export type StudentWindow = { attendance: AttendanceRow[]; reports: ReportRow[]; homework: HomeworkRow[] };

export type Severity = "high" | "medium" | "watch";
export type SignalKind = "absence_streak" | "absence_total" | "rating_drop" | "low_rating" | "low_focus" | "tired" | "homework";
export type Signal = { kind: SignalKind; severity: Severity; title: string; detail: string; subject?: SubjectKey; criterion?: string };
export type RiskResult = { level: Severity | "ok"; score: number; signals: Signal[] };

const WEIGHT: Record<Severity, number> = { high: 5, medium: 3, watch: 1 };
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const isAbsent = (s: AttendanceRow["status"]) => s === "absent" || s === "absent_with_permission";

/** Cụm từ giáo viên hay dùng khi bé chưa tập trung / cần cố gắng (so khớp không dấu). */
const FOCUS_PHRASES = ["can co gang", "chua tap trung", "mat tap trung", "khong tap trung", "lo de", "lo dang", "hay noi chuyen", "chua chu y", "hay quay", "xao nhang"];
function fold(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");
}

/** Phân tích 1 học sinh trong khung 30 ngày kết thúc ở `today`. */
export function analyzeStudent(w: StudentWindow, today: string): RiskResult {
  const signals: Signal[] = [];
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));

  // 1. Chuyên cần: nghỉ liên tiếp (theo các buổi đã điểm danh) và tổng số buổi nghỉ
  const att = [...w.attendance].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  let longest = { len: 0, from: "", to: "" };
  let start = "";
  for (const a of att) {
    if (isAbsent(a.status)) {
      if (streak === 0) start = a.date;
      streak++;
      if (streak > longest.len) longest = { len: streak, from: start, to: a.date };
    } else streak = 0;
  }
  const absences = att.filter((a) => isAbsent(a.status)).length;
  if (longest.len >= 3) {
    signals.push({
      kind: "absence_streak",
      severity: longest.len >= 5 || streak >= 3 ? "high" : "medium",
      title: `Nghỉ ${longest.len} buổi liên tiếp`,
      detail: `Từ ${dayMonth(longest.from)} đến ${dayMonth(longest.to)}${streak >= 3 ? " — vẫn đang nghỉ" : ""}.`,
    });
  } else if (absences >= 4) {
    signals.push({ kind: "absence_total", severity: absences >= 6 ? "medium" : "watch", title: `Nghỉ ${absences} buổi trong ${WINDOW_DAYS} ngày`, detail: `${absences}/${att.length} buổi đã điểm danh.` });
  }

  // 2. Đánh giá từng môn: xu hướng đi xuống / thấp kéo dài
  for (const key of Object.keys(SUBJECTS) as SubjectKey[]) {
    const ratings = w.reports.flatMap((r) => (typeof r.subjects[key]?.rating === "number" ? [{ date: r.date, v: r.subjects[key]!.rating! }] : []));
    const recent = ratings.filter((r) => r.date >= recentFrom).map((r) => r.v);
    const before = ratings.filter((r) => r.date < recentFrom).map((r) => r.v);
    const ra = avg(recent);
    const ba = avg(before);
    if (ra !== null && ba !== null && recent.length >= 2 && before.length >= 2 && ba - ra >= 0.8 && ra <= 3.5) {
      signals.push({
        kind: "rating_drop",
        severity: ra <= 2.5 ? "high" : "medium",
        subject: key,
        title: `${SUBJECTS[key]} đi xuống`,
        detail: `Trung bình ${round1(ba)}★ → ${round1(ra)}★ (${RECENT_DAYS} ngày gần đây, ${recent.length} buổi).`,
      });
    } else if (ra !== null && recent.length >= 3 && ra <= 2.5) {
      signals.push({ kind: "low_rating", severity: "medium", subject: key, title: `${SUBJECTS[key]} còn thấp`, detail: `Trung bình ${round1(ra)}★ trong ${recent.length} buổi gần đây.` });
    }

    // Tiêu chí thấp nhất của môn (gần đây) — dùng cho gợi ý can thiệp cụ thể
    const crit = Object.entries(SUBJECT_CRITERIA[key])
      .map(([ck, label]): { ck: string; label: string; a: number | null } => ({ ck, label, a: avg(w.reports.filter((r) => r.date >= recentFrom).flatMap((r) => (typeof r.subjects[key]?.criteria[ck] === "number" ? [r.subjects[key]!.criteria[ck]!] : []))) }))
      .filter((c): c is { ck: string; label: string; a: number } => c.a !== null && c.a <= 2.5)
      .sort((a, b) => a.a - b.a)[0];
    if (crit) {
      const existing = signals.find((s) => s.subject === key && (s.kind === "rating_drop" || s.kind === "low_rating"));
      if (existing) existing.criterion = crit.ck;
      else
        signals.push({ kind: "low_rating", severity: "watch", subject: key, criterion: crit.ck, title: `${SUBJECTS[key]}: ${crit.label.toLowerCase()} yếu`, detail: `Tiêu chí "${crit.label}" trung bình ${round1(crit.a)}★ gần đây.` });
    }
  }

  // 3. Nhận xét lặp lại "cần cố gắng / chưa tập trung…" trong 14 ngày gần đây
  const recentReports = w.reports.filter((r) => r.date >= recentFrom);
  const focusDays = recentReports.filter((r) => {
    const text = fold([r.note ?? "", ...Object.values(r.subjects).map((s) => s?.comment ?? "")].join(" "));
    return FOCUS_PHRASES.some((p) => text.includes(p));
  });
  if (focusDays.length >= 3) {
    signals.push({ kind: "low_focus", severity: focusDays.length >= 5 ? "medium" : "watch", title: "Hay được nhắc chưa tập trung", detail: `${focusDays.length} buổi gần đây có nhận xét "cần cố gắng / chưa tập trung".` });
  }
  const tired = recentReports.filter((r) => r.mood === "tired").length;
  if (recentReports.length >= 4 && tired / recentReports.length >= 0.4) {
    signals.push({ kind: "tired", severity: "watch", title: "Thường mệt mỏi", detail: `${tired}/${recentReports.length} buổi gần đây tâm trạng "Mệt mỏi".` });
  }

  // 4. Bài tập về nhà: không nộp / nộp muộn
  const due = w.homework.filter((h) => h.dueDate < today);
  const missing = due.filter((h) => !h.submittedOn).length;
  const late = due.filter((h) => h.submittedOn && h.submittedOn > h.dueDate).length;
  if (due.length >= 2 && (missing + late) / due.length >= 0.5) {
    signals.push({
      kind: "homework",
      severity: missing >= 3 ? "high" : missing >= 2 ? "medium" : "watch",
      title: missing ? `Chưa nộp ${missing}/${due.length} bài tập` : `Nộp muộn ${late}/${due.length} bài tập`,
      detail: [missing && `${missing} bài chưa nộp`, late && `${late} bài nộp muộn`].filter(Boolean).join(", ") + ` trên ${due.length} bài đã đến hạn.`,
    });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, watch: 2 };
  signals.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = signals.reduce((n, s) => n + WEIGHT[s.severity], 0);
  // 1 cảnh báo đỏ, hoặc nhiều cảnh báo cùng lúc → mức cao hơn
  const level: RiskResult["level"] =
    signals.some((s) => s.severity === "high") || score >= 8 ? "high" : signals.some((s) => s.severity === "medium") || score >= 3 ? "medium" : signals.length ? "watch" : "ok";
  return { level, score, signals };
}

/** Dấu vân tay của các cảnh báo — gợi ý AI đã lưu chỉ còn dùng khi tình hình không đổi. */
export function signalsFingerprint(signals: Signal[]): string {
  return signals.map((s) => `${s.kind}:${s.severity}:${s.subject ?? ""}:${s.criterion ?? ""}`).sort().join("|");
}
