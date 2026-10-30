import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SHIFT } from "@/lib/shifts";
import { givenName } from "@/lib/utils";
import { listStudents } from "@/features/students/queries";
import type { Enums } from "@/types/database.types";
import { computePayroll, monthRange, type RateRow, type ScheduleClass, type SessionRecord } from "./constants";

/** Bảng / cột chưa tạo (chưa chạy apply-teaching-payroll.sql). */
export function isMissing(error: Pick<PostgrestError, "code">) {
  return ["PGRST205", "PGRST204", "PGRST202", "42P01", "42703", "42883"].includes(error.code);
}

const SESSION_COLUMNS =
  "id, teacher_id, class_id, class_name, campus, subject, date, scheduled_start, scheduled_end, checked_in_at, checked_out_at, status, off_schedule, rate, note";
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

type ClassRaw = {
  id: string;
  campus: Enums<"campus">;
  name: string;
  subject?: string | null;
  room?: string | null;
  shift: { name: string; start_time: string; end_time: string; weekdays: number[]; is_active: boolean } | null;
};

/** Lớp kèm ca học (+ môn, phòng nếu DB đã có cột). RLS: giáo viên chỉ thấy lớp phụ trách. */
async function loadClasses(): Promise<{ classes: ClassRaw[]; hasMeta: boolean }> {
  const supabase = await createClient();
  const shift = "shift:class_shifts(name, start_time, end_time, weekdays, is_active)";
  const res = await supabase.from("classes").select(`id, campus, name, subject, room, ${shift}`);
  if (!res.error) return { classes: res.data as unknown as ClassRaw[], hasMeta: true };
  if (!isMissing(res.error)) throw new Error("Không tải được lớp học", { cause: res.error });
  const base = await supabase.from("classes").select(`id, campus, name, ${shift}`);
  if (base.error) throw new Error("Không tải được lớp học", { cause: base.error });
  return { classes: base.data as unknown as ClassRaw[], hasMeta: false };
}

function toScheduleClass(c: ClassRaw, students: ScheduleClass["students"]): ScheduleClass {
  const active = c.shift?.is_active ? c.shift : null;
  return {
    id: c.id,
    campus: c.campus,
    name: c.name,
    subject: c.subject ?? null,
    room: c.room ?? null,
    shift: active ?? DEFAULT_SHIFT,
    hasShift: !!active,
    students,
  };
}

/**
 * Lịch dạy của giáo viên đang đăng nhập trong [from, to]:
 *  - `classes`: lớp được phân công RIÊNG (lên lịch), kèm học sinh phụ trách.
 *  - `otherClasses`: lớp khác giáo viên được phép dạy (phụ trách cả cơ sở) — để bắt đầu ca dạy thay / dạy bù.
 *  - `sessions`: ca đã bắt đầu / kết thúc.
 */
export async function getTeacherSchedule(teacherId: string, from: string, to: string) {
  const supabase = await createClient();
  const [{ classes, hasMeta }, assignRes, students, sessionsRes, ratesRes] = await Promise.all([
    loadClasses(),
    supabase.from("teacher_assignments").select("campus, class_name").eq("teacher_id", teacherId),
    listStudents(),
    supabase.from("teaching_sessions").select(SESSION_COLUMNS).eq("teacher_id", teacherId).gte("date", from).lte("date", to).order("date"),
    supabase.from("teacher_pay_rates").select("subject, teacher_id, rate"),
  ]);
  if (assignRes.error) throw new Error("Không tải được phân công", { cause: assignRes.error });
  const available = hasMeta && !sessionsRes.error;
  if (sessionsRes.error && !isMissing(sessionsRes.error)) throw new Error("Không tải được ca dạy", { cause: sessionsRes.error });

  const own = new Set(assignRes.data.filter((a) => a.class_name).map((a) => `${a.campus}:${a.class_name}`));
  const byClass = new Map<string, ScheduleClass["students"]>();
  for (const s of students) {
    const key = `${s.campus}:${s.class_name}`;
    byClass.set(key, [...(byClass.get(key) ?? []), { id: s.id, full_name: s.full_name }]);
  }
  for (const list of byClass.values()) list.sort((a, b) => collator.compare(givenName(a.full_name), givenName(b.full_name)));

  const all = classes
    .map((c) => toScheduleClass(c, byClass.get(`${c.campus}:${c.name}`) ?? []))
    .sort((a, b) => a.campus.localeCompare(b.campus) || collator.compare(a.name, b.name));
  return {
    available,
    classes: all.filter((c) => own.has(`${c.campus}:${c.name}`)),
    otherClasses: all.filter((c) => !own.has(`${c.campus}:${c.name}`)),
    sessions: (sessionsRes.data ?? []) as SessionRecord[],
    rates: (ratesRes.error ? [] : ratesRes.data) as RateRow[],
  };
}

export type TeacherSchedule = Awaited<ReturnType<typeof getTeacherSchedule>>;

// ----------------------------------------------------------------------------- Quản trị: lương

export async function getPayroll(month: string) {
  const supabase = await createClient();
  const { from, to } = monthRange(month);
  const [teachersRes, sessionsRes, ratesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, campus").eq("role", "teacher").order("full_name"),
    supabase.from("teaching_sessions").select(SESSION_COLUMNS).gte("date", from).lte("date", to).order("date").order("checked_in_at"),
    supabase.from("teacher_pay_rates").select("subject, teacher_id, rate"),
  ]);
  if (sessionsRes.error && isMissing(sessionsRes.error)) return { available: false as const };
  if (teachersRes.error) throw new Error("Không tải được giáo viên", { cause: teachersRes.error });
  if (sessionsRes.error) throw new Error("Không tải được ca dạy", { cause: sessionsRes.error });
  if (ratesRes.error) throw new Error("Không tải được đơn giá", { cause: ratesRes.error });

  const sessions = sessionsRes.data as (SessionRecord & { teacher_id: string })[];
  return {
    available: true as const,
    teachers: teachersRes.data,
    sessions,
    rates: ratesRes.data as RateRow[],
    rows: computePayroll(teachersRes.data, sessions, ratesRes.data as RateRow[]),
  };
}

/** Thiết lập: đơn giá + môn / phòng từng lớp. */
export async function getPaySettings() {
  const supabase = await createClient();
  const [ratesRes, { classes, hasMeta }, teachersRes, capacityRes] = await Promise.all([
    supabase.from("teacher_pay_rates").select("id, subject, teacher_id, rate"),
    loadClasses(),
    supabase.from("profiles").select("id, full_name").eq("role", "teacher").order("full_name"),
    // Sĩ số tối đa có sau apply-analytics.sql — chưa có cột thì ẩn ô nhập
    supabase.from("classes").select("id, capacity"),
  ]);
  const capacity = capacityRes.error ? null : new Map(capacityRes.data.map((c) => [c.id, c.capacity ?? null]));
  if ((ratesRes.error && isMissing(ratesRes.error)) || !hasMeta) return { available: false as const };
  if (ratesRes.error) throw new Error("Không tải được đơn giá", { cause: ratesRes.error });
  if (teachersRes.error) throw new Error("Không tải được giáo viên", { cause: teachersRes.error });
  return {
    available: true as const,
    rates: ratesRes.data,
    teachers: teachersRes.data,
    classes: classes
      .map((c) => ({ id: c.id, campus: c.campus, name: c.name, subject: c.subject ?? null, room: c.room ?? null, capacity: capacity ? (capacity.get(c.id) ?? null) : undefined }))
      .sort((a, b) => a.campus.localeCompare(b.campus) || collator.compare(a.name, b.name)),
  };
}
