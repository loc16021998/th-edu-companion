import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { STUDENT_COLUMNS, type StudentRecord } from "@/features/students/queries";

/**
 * Cache giữa các lượt truy cập cho phụ huynh — 2 truy vấn được gọi nhiều nhất (mọi tab đều cần danh sách con;
 * Lịch học / Chuyên cần cần lịch sử điểm danh). Đọc bằng service role nhưng lọc ĐÚNG như RLS:
 *   - danh sách con: students.parent_id = id phụ huynh đã xác thực;
 *   - điểm danh: chỉ gọi cho bé đã được xác nhận thuộc phụ huynh (getSelectedChild).
 * Dữ liệu được làm mới ngay khi có thay đổi (revalidateTag ở các thao tác ghi) — `revalidate` chỉ là lưới an toàn.
 */
export const cacheEnabled = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function listParentChildrenCached(parentId: string): Promise<StudentRecord[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const run = (columns: string) => admin.from("students").select(columns).eq("parent_id", parentId).order("class_name").order("full_name");
      let res = await run(STUDENT_COLUMNS);
      if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) res = await run(STUDENT_COLUMNS.replace(", subjects", ""));
      if (res.error) throw res.error;
      return res.data as unknown as StudentRecord[];
    },
    ["parent-children", parentId],
    { tags: [CACHE_TAGS.students, CACHE_TAGS.parentChildren(parentId)], revalidate: 600 },
  )();
}

export type AttendanceRecord = { id: string; student_id: string; date: string; status: StudentAttendanceStatus; note: string | null; created_at: string };
type StudentAttendanceStatus = "present" | "absent" | "late" | "absent_with_permission";

/** CHỈ gọi sau khi đã xác nhận `studentId` thuộc người dùng hiện tại. */
export function listChildAttendanceCached(studentId: string, from: string, to: string): Promise<AttendanceRecord[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("attendance")
        .select("id, student_id, date, status, note, created_at")
        .eq("student_id", studentId)
        .gte("date", from)
        .lte("date", to)
        .order("date");
      if (error) throw new Error("Không tải được lịch sử điểm danh", { cause: error });
      return data;
    },
    ["child-attendance", studentId, from, to],
    { tags: [CACHE_TAGS.attendance(studentId)], revalidate: 600 },
  )();
}
