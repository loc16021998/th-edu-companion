import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

/** Cột học sinh dùng trong app (không SELECT *). `subjects` có từ migration môn đăng ký. */
export const STUDENT_COLUMNS = "id, full_name, dob, class_name, campus, parent_id, avatar_url, created_at, subjects";
/** Dự phòng khi DB chưa chạy migration môn đăng ký (cột `subjects` chưa có). */
const STUDENT_COLUMNS_BASE = "id, full_name, dob, class_name, campus, parent_id, avatar_url, created_at";

const isMissingColumn = (code: string | undefined) => code === "42703" || code === "PGRST204";

/**
 * Danh sách học sinh mà user hiện tại được phép xem.
 * Không cần filter theo vai trò — RLS tự giới hạn:
 *   parent → con mình, teacher → lớp/cơ sở phụ trách, admin → tất cả.
 * `cache`: layout + page + các màn con trong CÙNG một lượt render chỉ truy vấn 1 lần.
 */
export const listStudents = cache(async () => {
  const supabase = await createClient();
  const run = (columns: string) => supabase.from("students").select(columns).order("class_name").order("full_name");
  let res = await run(STUDENT_COLUMNS);
  if (res.error && isMissingColumn(res.error.code)) res = await run(STUDENT_COLUMNS_BASE);
  if (res.error) throw res.error;
  return res.data as unknown as StudentRecord[];
});

export const getStudent = cache(async (studentId: string) => {
  const supabase = await createClient();
  const run = (columns: string) => supabase.from("students").select(columns).eq("id", studentId).maybeSingle();
  let res = await run(STUDENT_COLUMNS);
  if (res.error && isMissingColumn(res.error.code)) res = await run(STUDENT_COLUMNS_BASE);
  if (res.error) throw res.error;
  return res.data as unknown as StudentRecord | null;
});

/** Bản ghi học sinh (subjects có thể thiếu khi DB cũ — enrolledSubjects() đã xử lý). */
export type StudentRecord = Tables<"students">;
