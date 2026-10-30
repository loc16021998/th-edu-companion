import "server-only";
import { CAMPUS_LABELS } from "@/config/constants";
import { countAttendance } from "@/config/constants";
import { createClient } from "@/lib/supabase/server";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { getLoginEmails } from "@/features/admin/accounts";
import { CAMPUS_LIST, previousMonth, type Campus } from "./constants";

// Mọi truy vấn chạy bằng session quản trị (RLS admin_all_*).

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST204" || code === "42703";
}

/** Mốc giờ Việt Nam đầu tháng (để lọc timestamptz). */
function vnMidnight(day: string) {
  return `${day}T00:00:00+07:00`;
}

const emptyByCampus = <T,>(make: () => T) => Object.fromEntries(CAMPUS_LIST.map((c) => [c, make()])) as Record<Campus, T>;

// ============================================================================ Tổng quan vận hành

export type LatePayer = {
  key: string;
  parentName: string | null;
  phone: string | null;
  children: { name: string; className: string; campus: Campus }[];
  owed: number;
  feeCount: number;
  oldestDue: string;
};

export async function getCenterDashboard(today: string) {
  const supabase = await createClient();
  const month = startOfMonth(today);
  const nextMonth = addMonths(month, 1);

  const [classesRes, studentsRes, teachersRes, assignmentsRes, attendanceRes, teacherAttRes, unpaidRes, paymentsRes, periodRes] = await Promise.all([
    supabase.from("classes").select("campus"),
    supabase.from("students").select("campus"),
    supabase.from("profiles").select("id, campus").eq("role", "teacher"),
    supabase.from("teacher_assignments").select("teacher_id, campus"),
    supabase.from("attendance").select("status, student:students!inner(campus)").eq("date", today),
    supabase.from("teacher_attendance").select("status").eq("date", today),
    supabase
      .from("fees")
      .select(
        "amount, paid_amount, due_date, student:students!inner(id, full_name, class_name, campus, parent:profiles!students_parent_id_fkey(id, full_name, phone))",
      )
      .neq("status", "paid")
      .limit(5000),
    supabase
      .from("fee_payments")
      .select("amount, fee:fees!inner(student:students!inner(campus))")
      .gte("paid_at", vnMidnight(month))
      .lt("paid_at", vnMidnight(nextMonth))
      .limit(10000),
    supabase.from("fees").select("amount, paid_amount, student:students!inner(campus)").eq("period", month).limit(5000),
  ]);
  for (const res of [classesRes, studentsRes, teachersRes, assignmentsRes, attendanceRes, teacherAttRes, unpaidRes]) {
    if (res.error) throw new Error("Không tải được số liệu tổng quan", { cause: res.error });
  }

  // --- Quy mô theo cơ sở
  const scale = emptyByCampus(() => ({ students: 0, teachers: 0, classes: 0 }));
  for (const c of classesRes.data!) scale[c.campus].classes += 1;
  for (const s of studentsRes.data!) scale[s.campus].students += 1;
  const teacherCampuses = new Map<string, Set<Campus>>();
  for (const t of teachersRes.data!) teacherCampuses.set(t.id, new Set(t.campus ? [t.campus] : []));
  for (const a of assignmentsRes.data!) teacherCampuses.get(a.teacher_id)?.add(a.campus);
  let unassignedTeachers = 0;
  for (const set of teacherCampuses.values()) {
    if (set.size === 0) unassignedTeachers += 1;
    for (const c of set) scale[c].teachers += 1;
  }

  // --- Điểm danh hôm nay
  const attendance = emptyByCampus(() => countAttendance([]));
  for (const a of attendanceRes.data!) attendance[a.student.campus][a.status] += 1;
  const teacherAtt = countAttendance(teacherAttRes.data!.map((t) => t.status));

  // --- Học phí: còn nợ, quá hạn, danh sách chậm đóng
  const outstanding = emptyByCampus(() => 0);
  const overdue = emptyByCampus(() => 0);
  const payers = new Map<string, LatePayer>();
  for (const f of unpaidRes.data!) {
    const due = f.amount - f.paid_amount;
    if (due <= 0) continue;
    const st = f.student;
    outstanding[st.campus] += due;
    if (!f.due_date || f.due_date >= today) continue;
    overdue[st.campus] += due;
    const key = st.parent?.id ?? `student:${st.id}`;
    const entry = payers.get(key) ?? {
      key,
      parentName: st.parent?.full_name || null,
      phone: st.parent?.phone ?? null,
      children: [],
      owed: 0,
      feeCount: 0,
      oldestDue: f.due_date,
    };
    entry.owed += due;
    entry.feeCount += 1;
    if (f.due_date < entry.oldestDue) entry.oldestDue = f.due_date;
    if (!entry.children.some((c) => c.name === st.full_name)) entry.children.push({ name: st.full_name, className: st.class_name, campus: st.campus });
    payers.set(key, entry);
  }
  const latePayers = [...payers.values()].sort((a, b) => a.oldestDue.localeCompare(b.oldestDue) || b.owed - a.owed);

  // --- Đã thu trong tháng (nhật ký thu tiền — cần migration admin-center)
  let collected: Record<Campus, number> | null = null;
  if (!paymentsRes.error) {
    collected = emptyByCampus(() => 0);
    for (const p of paymentsRes.data) collected[p.fee.student.campus] += p.amount;
  } else if (!isMissing(paymentsRes.error.code)) {
    console.error("[center] Không tải được nhật ký thu tiền:", paymentsRes.error);
  }

  // --- Kỳ học phí tháng này (khoản tạo bằng "Tạo học phí tháng")
  let period: { issued: number; paid: number; count: number } | null = null;
  if (!periodRes.error) {
    period = { issued: 0, paid: 0, count: periodRes.data.length };
    for (const f of periodRes.data) {
      period.issued += f.amount;
      period.paid += f.paid_amount;
    }
  }

  return {
    month,
    scale,
    unassignedTeachers,
    teacherTotal: teachersRes.data!.length,
    attendance,
    teacherAtt,
    outstanding,
    overdue,
    collected,
    period,
    latePayers,
    migrated: !paymentsRes.error,
  };
}

export type CenterDashboard = Awaited<ReturnType<typeof getCenterDashboard>>;

// ============================================================================ Giáo viên

export type TeacherRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  campus: Campus | null;
  /** Phân công: class_name null = phụ trách toàn cơ sở */
  assignments: { campus: Campus; class_name: string | null }[];
};

export async function listTeachersForManagement(): Promise<TeacherRow[]> {
  const supabase = await createClient();
  const [profilesRes, assignmentsRes, emails] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, campus").eq("role", "teacher"),
    supabase.from("teacher_assignments").select("teacher_id, campus, class_name"),
    getLoginEmails(),
  ]);
  if (profilesRes.error) throw new Error("Không tải được giáo viên", { cause: profilesRes.error });
  if (assignmentsRes.error) throw new Error("Không tải được phân công", { cause: assignmentsRes.error });
  return profilesRes.data
    .map((p) => ({
      ...p,
      email: emails.get(p.id) ?? null,
      assignments: assignmentsRes.data.filter((a) => a.teacher_id === p.id).map(({ campus, class_name }) => ({ campus, class_name })),
    }))
    .sort((a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)));
}

// ============================================================================ Tạo học phí tháng

export type FeeGeneratorClass = {
  id: string;
  campus: Campus;
  name: string;
  monthlyFee: number | null;
  students: number;
  /** Số bé đã có khoản học phí của kỳ này (sẽ bỏ qua) */
  alreadyIssued: number;
  /** Số buổi nghỉ có phép THÁNG TRƯỚC của từng bé chưa có khoản kỳ này (chỉ bé có ≥ 1 buổi) */
  excusedCounts: number[];
};

/**
 * Số buổi "Nghỉ có phép" (đơn xin nghỉ được duyệt) của từng bé trong tháng `month`.
 * Lọc trạng thái ở JS (không đưa giá trị enum mới vào truy vấn → DB chưa chạy migration vẫn không lỗi).
 */
export async function countExcusedSessions(supabase: Awaited<ReturnType<typeof createClient>>, month: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, status")
    .gte("date", month)
    .lte("date", endOfMonth(month))
    .neq("status", "present")
    .limit(20000);
  const map = new Map<string, number>();
  if (error) {
    console.error("[center] Không đếm được buổi nghỉ có phép:", error);
    return map;
  }
  for (const a of data) if (a.status === "absent_with_permission") map.set(a.student_id, (map.get(a.student_id) ?? 0) + 1);
  return map;
}

export async function getFeeGeneratorData(month: string): Promise<{ available: boolean; classes: FeeGeneratorClass[] }> {
  const supabase = await createClient();
  const [classesRes, studentsRes, issuedRes, excused] = await Promise.all([
    supabase.from("classes").select("id, campus, name, monthly_fee"),
    supabase.from("students").select("id, campus, class_name"),
    supabase.from("fees").select("student_id").eq("period", month).limit(10000),
    countExcusedSessions(supabase, previousMonth(month)),
  ]);
  const migrationError = [classesRes.error, issuedRes.error].find((e) => e && isMissing(e.code));
  if (migrationError) return { available: false, classes: [] };
  for (const res of [classesRes, studentsRes, issuedRes]) {
    if (res.error) throw new Error("Không tải được dữ liệu học phí", { cause: res.error });
  }
  const issued = new Set(issuedRes.data!.map((f) => f.student_id));
  return {
    available: true,
    classes: classesRes
      .data!.map((c) => {
        const list = studentsRes.data!.filter((s) => s.campus === c.campus && s.class_name === c.name);
        return {
          id: c.id,
          campus: c.campus,
          name: c.name,
          monthlyFee: c.monthly_fee,
          students: list.length,
          alreadyIssued: list.filter((s) => issued.has(s.id)).length,
          excusedCounts: list.flatMap((s) => (!issued.has(s.id) && excused.get(s.id) ? [excused.get(s.id)!] : [])),
        };
      })
      .sort((a, b) => CAMPUS_LIST.indexOf(a.campus) - CAMPUS_LIST.indexOf(b.campus) || collator.compare(a.name, b.name)),
  };
}

// ============================================================================ Thông báo chung

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  audienceLabel: string;
  recipientCount: number;
  createdAt: string;
};

function audienceLabel(a: { audience: string; campus: Campus | null; class_ids: string[] }, classNames: Map<string, string>) {
  if (a.audience === "campus" && a.campus) return `Phụ huynh ${CAMPUS_LABELS[a.campus]}`;
  if (a.audience === "classes") {
    const names = a.class_ids.map((id) => classNames.get(id) ?? "lớp đã xoá");
    return `Lớp ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` +${names.length - 6}` : ""}`;
  }
  return "Toàn bộ phụ huynh";
}

/** Quản trị: thông báo đã đăng (mới nhất trước). */
export async function listAnnouncements(): Promise<{ available: boolean; items: AnnouncementRow[] }> {
  const supabase = await createClient();
  const [res, classesRes] = await Promise.all([
    supabase.from("announcements").select("id, title, body, category, audience, campus, class_ids, recipient_count, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("classes").select("id, name, campus"),
  ]);
  if (res.error) {
    if (isMissing(res.error.code)) return { available: false, items: [] };
    throw new Error("Không tải được thông báo", { cause: res.error });
  }
  const classNames = new Map((classesRes.data ?? []).map((c) => [c.id, `${c.name} (${c.campus === "CS1_XALA" ? "CS1" : "CS2"})`]));
  return {
    available: true,
    items: res.data.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      audienceLabel: audienceLabel(a, classNames),
      recipientCount: a.recipient_count,
      createdAt: a.created_at,
    })),
  };
}

/** Phụ huynh: thông báo gửi tới mình (RLS lọc theo lớp / cơ sở của con). */
export async function listParentAnnouncements(): Promise<{ available: boolean; items: Omit<AnnouncementRow, "audienceLabel" | "recipientCount">[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, category, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được thông báo", { cause: error });
  }
  return { available: true, items: data.map((a) => ({ id: a.id, title: a.title, body: a.body, category: a.category, createdAt: a.created_at })) };
}
