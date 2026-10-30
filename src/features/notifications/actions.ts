"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { uuidSchema } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import { isISODate } from "@/lib/date";
import type { ActionResult } from "@/types/action-result";
import type { Tables } from "@/types/database.types";

/**
 * Ai nhận thông báo thì được đánh dấu đã đọc thông báo của chính mình: phụ huynh, giáo viên và cả quản trị viên
 * (lịch hẹn với Ban quản lý). Thiếu "admin" → requireRole chuyển quản trị viên về Tổng quan ngay khi mở trang.
 */
const RECIPIENT_ROLES = ["parent", "teacher", "admin"] as const;

/** Làm mới đúng khu của người dùng (chuông, huy hiệu menu). */
function revalidateArea(role: string) {
  revalidatePath(role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/parent", "layout");
}

/** Đánh dấu 1 thông báo đã đọc. RLS + quyền cột chỉ cho sửa read_at trên thông báo của mình. */
export async function markNotificationRead(id: string): Promise<ActionResult<null>> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Thông báo không hợp lệ." };
  const profile = await requireRole(...RECIPIENT_ROLES);

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", parsed.data)
      .eq("recipient_id", profile.id)
      .is("read_at", null);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[notifications] markNotificationRead lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  revalidateArea(profile.role);
  return { ok: true, data: null };
}

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  const profile = await requireRole(...RECIPIENT_ROLES);

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", profile.id)
      .is("read_at", null);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[notifications] markAllNotificationsRead lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  revalidateArea(profile.role);
  return { ok: true, data: null };
}

/** Phụ huynh đã mở tab Phản hồi → coi như đã đọc các thông báo "nhà trường trả lời". */
export async function markFeedbackNotificationsRead(): Promise<ActionResult<null>> {
  const profile = await requireRole("parent", "teacher");
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", profile.id)
      .eq("type", "feedback")
      .is("read_at", null);
    if (error) return { ok: false, error: dbErrorMessage(error) };
  } catch (err) {
    console.error("[notifications] markFeedbackNotificationsRead lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }
  revalidatePath("/parent", "layout");
  revalidatePath("/teacher", "layout");
  return { ok: true, data: null };
}

const markForSchema = z.object({
  types: z.array(z.string().min(1).max(40)).min(1).max(12),
  studentId: z.string().uuid().nullable().default(null),
  /** Chỉ các thông báo có ref_date trong khoảng (vd. điểm danh / sổ liên lạc của ngày đang xem) */
  from: z.string().refine(isISODate).nullable().default(null),
  to: z.string().refine(isISODate).nullable().default(null),
});

/**
 * Mở trang nội dung (từ danh sách, từ thông báo đẩy, hoặc vào thẳng) → các thông báo liên quan coi như đã xem,
 * chuông tự giảm (realtime). Chỉ chạm thông báo của chính người dùng (RLS + điều kiện recipient_id).
 */
export async function markNotificationsReadFor(input: z.input<typeof markForSchema>): Promise<ActionResult<{ marked: number }>> {
  const parsed = markForSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const profile = await requireRole(...RECIPIENT_ROLES);
  const v = parsed.data;
  try {
    const supabase = await createClient();
    let query = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", profile.id)
      .in("type", v.types as Tables<"notifications">["type"][])
      .is("read_at", null);
    if (v.studentId) query = query.eq("student_id", v.studentId);
    if (v.from) query = query.gte("ref_date", v.from);
    if (v.to) query = query.lte("ref_date", v.to);
    const { data, error } = await query.select("id");
    if (error) return { ok: false, error: dbErrorMessage(error) };
    if (data.length) {
      revalidateArea(profile.role);
    }
    return { ok: true, data: { marked: data.length } };
  } catch (err) {
    console.error("[notifications] markNotificationsReadFor lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }
}
