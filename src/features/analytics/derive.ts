// Trung tâm phân tích — biến JSON từ analytics_report() (SQL) thành KPI / số liệu biểu đồ. Module thuần (server + client + test).
import type { Campus } from "@/config/campuses";

export type MonthRow = {
  month: string;
  new_students: number;
  active_students: number;
  retained: number | null;
  retention_base: number | null;
  collected: number;
  issued: number;
  outstanding: number;
};
export type WeekRow = { week: string; campus: Campus; present: number; late: number; absent: number; excused: number };
export type ClassRow = {
  campus: Campus;
  class_name: string;
  students: number;
  records: number;
  absent_rate: number | null;
  late_rate: number | null;
  prev_absent_rate: number | null;
};
export type FillRow = { subject: string; classes: number; classes_with_capacity: number; capacity: number; students: number; students_in_capped: number };
export type CampusStats = {
  attendance_rate: number | null;
  collected_month: number;
  issued_month: number;
  outstanding: number;
  classes: number;
  new_students_month: number;
};
export type AnalyticsReport = {
  students_by_campus: Partial<Record<Campus, number>>;
  subjects_by_campus: Record<string, Partial<Record<Campus, number>>>;
  fill: FillRow[];
  monthly: MonthRow[];
  weekly: WeekRow[];
  classes: ClassRow[];
  campus: Record<Campus, CampusStats>;
  interest?: { month: string; subject: string; leads: number }[];
  funnel?: { leads: number; trialed: number; enrolled: number; enrolled_after_trial: number; lost: number; open: number };
  enroll_subjects: { month: string; subject: string; students: number }[];
  this_week?: { from: string; collected: number; new_students: number };
  leads_this_week?: number;
  generated_at: string;
  today: string;
  from_month: string;
  from_week: string;
};

export const SUBJECT_KEYS = ["tien_tieu_hoc", "luyen_chu", "toan_tu_duy"] as const;
export const SUBJECT_LABEL: Record<string, string> = { tien_tieu_hoc: "Tiền tiểu học", luyen_chu: "Luyện chữ đẹp", toan_tu_duy: "Toán tư duy", tong_hop: "Tổng hợp" };
/** Màu theo môn — 3 slot đầu bảng màu đã kiểm định (CVD all-pairs). Luôn kèm chú giải + bảng số liệu. */
export const SUBJECT_COLOR: Record<string, string> = { tien_tieu_hoc: "#2a78d6", toan_tu_duy: "#eb6834", luyen_chu: "#1baf7a" };
export const CAMPUS_SERIES_COLOR: Record<Campus, string> = { CS1_XALA: "#0284c7", CS2_NGOTHINHAM: "#f59e0b" };
export const MONEY_COLOR = { collected: "#2a78d6", outstanding: "#eb6834" };

/** Lớp "cần chú ý": nghỉ không phép ≥ 15% trong 4 tuần, hoặc tăng ≥ 5 điểm % so với 4 tuần trước. */
export const ABSENT_ALERT = 15;
export const ABSENT_RISE_ALERT = 5;

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const monthShort = (m: string) => `T${Number(m.slice(5, 7))}/${m.slice(2, 4)}`;
export const weekShort = (w: string) => `${w.slice(8, 10)}/${w.slice(5, 7)}`;

export function deriveKpis(r: AnalyticsReport) {
  const students = sum(Object.values(r.students_by_campus).map(Number));
  const last = r.monthly[r.monthly.length - 1];
  const prev = r.monthly[r.monthly.length - 2];
  const retentionNow = last?.retention_base ? pct(last.retained ?? 0, last.retention_base) : null;
  const recent = r.monthly.slice(-4, -1).filter((m) => m.retention_base); // 3 tháng đã trọn vẹn
  const retention3m = recent.length ? pct(sum(recent.map((m) => m.retained ?? 0)), sum(recent.map((m) => m.retention_base ?? 0))) : null;
  const totals = r.weekly.filter((w) => w.week >= weekKeyDaysAgo(r.today, 28));
  const attended = sum(totals.map((w) => w.present + w.late));
  const counted = sum(totals.map((w) => w.present + w.late + w.absent));
  const f = r.funnel;
  return {
    students,
    newThisMonth: last?.new_students ?? 0,
    activeThisMonth: last?.active_students ?? 0,
    activeDelta: last && prev ? last.active_students - prev.active_students : null,
    retentionNow,
    retention3m,
    attendanceRate: pct(attended, counted),
    collectedThisMonth: last?.collected ?? 0,
    outstandingTotal: sum(Object.values(r.campus).map((c) => c.outstanding)),
    trialConversion: f ? pct(f.enrolled_after_trial, f.trialed) : null,
    leadConversion: f ? pct(f.enrolled, f.leads - f.open) : null,
    funnel: f ?? null,
  };
}

/** Thứ 2 của tuần chứa (today − days) — so sánh với khoá tuần "YYYY-MM-DD" từ SQL. */
function weekKeyDaysAgo(today: string, days: number) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Doanh thu theo tháng: thực thu (theo ngày thu) vs còn thiếu của các khoản phát hành trong tháng. */
export function revenueSeries(r: AnalyticsReport) {
  return r.monthly.map((m) => ({ month: m.month, label: monthShort(m.month), collected: m.collected, outstanding: m.outstanding, issued: m.issued }));
}

/** Học sinh: mới nhập học / có đi học trong tháng / tỷ lệ giữ chân. */
export function studentSeries(r: AnalyticsReport) {
  return r.monthly.map((m) => ({
    month: m.month,
    label: monthShort(m.month),
    newStudents: m.new_students,
    active: m.active_students,
    retention: m.retention_base ? pct(m.retained ?? 0, m.retention_base) : null,
  }));
}

/** Theo tuần: tỷ lệ chuyên cần từng cơ sở + số buổi nghỉ (không phép / có phép) toàn trung tâm. */
export function attendanceSeries(r: AnalyticsReport) {
  const weeks = [...new Set(r.weekly.map((w) => w.week))].sort();
  return weeks.map((week) => {
    const rows = r.weekly.filter((w) => w.week === week);
    const rate = (c: Campus) => {
      const x = rows.find((w) => w.campus === c);
      return x ? pct(x.present + x.late, x.present + x.late + x.absent) : null;
    };
    return {
      week,
      label: weekShort(week),
      CS1_XALA: rate("CS1_XALA"),
      CS2_NGOTHINHAM: rate("CS2_NGOTHINHAM"),
      absent: sum(rows.map((w) => w.absent)),
      excused: sum(rows.map((w) => w.excused)),
      late: sum(rows.map((w) => w.late)),
    };
  });
}

/** Lớp cần chú ý (đủ dữ liệu ≥ 10 lượt điểm danh trong 4 tuần). */
export function classesNeedingAttention(r: AnalyticsReport) {
  return r.classes
    .filter((c) => c.records >= 10 && c.absent_rate !== null)
    .map((c) => ({ ...c, rise: c.prev_absent_rate !== null ? Math.round((c.absent_rate! - c.prev_absent_rate) * 10) / 10 : null }))
    .filter((c) => c.absent_rate! >= ABSENT_ALERT || (c.rise !== null && c.rise >= ABSENT_RISE_ALERT));
}

/** Quan tâm theo môn mỗi tháng: phụ huynh hỏi tư vấn (lead) + học sinh mới đăng ký môn. */
export function subjectTrend(r: AnalyticsReport) {
  return r.monthly.map((m) => {
    const row: Record<string, string | number> = { month: m.month, label: monthShort(m.month) };
    for (const s of SUBJECT_KEYS) {
      const leads = r.interest?.find((x) => x.month === m.month && x.subject === s)?.leads ?? 0;
      const enrolled = r.enroll_subjects.find((x) => x.month === m.month && x.subject === s)?.students ?? 0;
      row[s] = leads + enrolled;
      row[`${s}_leads`] = leads;
      row[`${s}_enrolled`] = enrolled;
    }
    return row;
  });
}

/** Tỷ lệ lấp đầy theo môn chính của lớp (chỉ tính lớp đã đặt sĩ số tối đa). */
export function fillRates(r: AnalyticsReport) {
  return r.fill
    .map((f) => ({ ...f, label: SUBJECT_LABEL[f.subject] ?? f.subject, rate: f.capacity > 0 ? pct(f.students_in_capped, f.capacity) : null }))
    .sort((a, b) => (SUBJECT_KEYS as readonly string[]).indexOf(a.subject) - (SUBJECT_KEYS as readonly string[]).indexOf(b.subject));
}

/** Số học sinh đăng ký từng môn (1 bé học nhiều môn → tính ở mỗi môn). */
export function subjectEnrollment(r: AnalyticsReport) {
  return SUBJECT_KEYS.map((s) => {
    const byCampus = r.subjects_by_campus[s] ?? {};
    return { subject: s, label: SUBJECT_LABEL[s]!, CS1_XALA: byCampus.CS1_XALA ?? 0, CS2_NGOTHINHAM: byCampus.CS2_NGOTHINHAM ?? 0, total: (byCampus.CS1_XALA ?? 0) + (byCampus.CS2_NGOTHINHAM ?? 0) };
  });
}
