import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Bảng chưa tạo (chưa chạy apply-admissions.sql) → `available: false` thay vì làm hỏng trang. */
function isMissing(error: PostgrestError) {
  return ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(error.code);
}

const TRIAL_COLUMNS =
  "id, lead_id, campus, class_id, teacher_id, program, scheduled_at, duration_minutes, status, note_for_teacher, confirmation_status, confirmed_at, assessment_level, assessment_skills, strengths, improvements, recommendation, assessed_at, created_at, class:classes(name), teacher:profiles!trial_classes_teacher_id_fkey(full_name)";

/** Toàn bộ học sinh tiềm năng (mới cập nhật trước) + các buổi học thử của từng bé. Chỉ quản trị viên (RLS). */
export async function listLeads() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      `id, full_name, dob, parent_name, phone, target_program, campus, source, status, notes, lost_reason, follow_up_on, assigned_to, converted_student_id, converted_at, status_changed_at, created_at, updated_at,
       assignee:profiles!leads_assigned_to_fkey(full_name), trials:trial_classes(${TRIAL_COLUMNS})`,
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissing(error)) return { available: false as const, items: [] };
    throw new Error("Không tải được danh sách tuyển sinh", { cause: error });
  }
  const items = data.map((l) => ({
    ...l,
    trials: [...l.trials].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
  }));
  return { available: true as const, items };
}

export type Lead = Awaited<ReturnType<typeof listLeads>>["items"][number];
export type LeadTrial = Lead["trials"][number];

/** Lịch học thử (60 ngày gần đây + sắp tới), kèm thông tin bé / phụ huynh. */
export async function listTrials() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("trial_classes")
    .select(`${TRIAL_COLUMNS}, lead:leads(id, full_name, dob, parent_name, phone, target_program, status, converted_student_id)`)
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: true })
    .limit(400);
  if (error) {
    if (isMissing(error)) return { available: false as const, items: [] };
    throw new Error("Không tải được lịch học thử", { cause: error });
  }
  return { available: true as const, items: data };
}

export type Trial = Awaited<ReturnType<typeof listTrials>>["items"][number];

/** Giáo viên: buổi học thử được phân công (RPC — không lộ SĐT / ghi chú tư vấn). */
export async function listMyTrials() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_trial_classes");
  if (error) {
    if (isMissing(error)) return { available: false as const, items: [] };
    throw new Error("Không tải được lịch học thử", { cause: error });
  }
  return { available: true as const, items: data };
}

export type TeacherTrial = Awaited<ReturnType<typeof listMyTrials>>["items"][number];
