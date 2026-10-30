"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { saveAttendanceSchema, type SaveAttendanceInput } from "./schema";
import { schedulePushDelivery } from "@/features/push/deliver";

/**
 * Lưu điểm danh cả lớp trong 1 lệnh upsert (theo student_id + date) — nguyên tử ở phía DB.
 * RLS đảm bảo giáo viên chỉ ghi được học sinh thuộc lớp/cơ sở mình phụ trách.
 */
export async function saveAttendance(input: SaveAttendanceInput): Promise<ActionResult<{ saved: number }>> {
  const parsed = saveAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu điểm danh không hợp lệ." };
  }
  await requireRole("teacher", "admin");

  const { date, records } = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("attendance").upsert(
      records.map((r) => ({ student_id: r.studentId, date, status: r.status, note: r.note || null })),
      { onConflict: "student_id,date" },
    );
    if (error) {
      console.error("[attendance] upsert thất bại:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[attendance] saveAttendance lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  // Lịch sử điểm danh (cache của phụ huynh) của các bé vừa điểm danh
  for (const id of new Set(records.map((r) => r.studentId))) revalidateTag(CACHE_TAGS.attendance(id));
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  // Đẩy thông báo lên điện thoại (Web Push / Zalo ZNS) ngay sau khi phản hồi
  schedulePushDelivery();
  return { ok: true, data: { saved: records.length } };
}
