"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { requireRole } from "@/features/auth/queries";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { createLeaveSchema, decideLeaveSchema, type CreateLeaveInput, type DecideLeaveInput } from "./schema";
import { INVALID_ID, isUuid } from "@/lib/validation";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const MISSING = "Database chưa có bảng đơn xin nghỉ — nhờ quản trị viên chạy file supabase/apply-leave-chat-push.sql.";

function revalidateLeave() {
  revalidatePath("/parent", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
}

/** Phụ huynh gửi đơn → giáo viên phụ trách nhận thông báo realtime + push. */
export async function createLeaveRequest(input: CreateLeaveInput): Promise<ActionResult<null>> {
  const parsed = createLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("parent");
  const v = parsed.data;
  const limit = await rateLimit("submitForm", `leave:${profile.id}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };

  try {
    const supabase = await createClient();
    // Trùng ngày với đơn đang chờ / đã duyệt của bé → báo thay vì tạo đơn mới
    const { data: overlap } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("student_id", v.studentId)
      .in("status", ["pending", "approved"])
      .lte("start_date", v.endDate)
      .gte("end_date", v.startDate)
      .limit(1);
    if (overlap?.length) return { ok: false, error: "Đã có đơn xin nghỉ trùng ngày cho bé (đang chờ hoặc đã được đồng ý)." };

    const { error } = await supabase.from("leave_requests").insert({
      student_id: v.studentId,
      parent_id: profile.id,
      start_date: v.startDate,
      end_date: v.endDate,
      reason: v.reason,
      note: v.note || null,
    });
    if (error) {
      if (error.code === "PGRST205") return { ok: false, error: MISSING };
      if (error.code === "42501") return { ok: false, error: "Không gửi được đơn cho học sinh này." };
      console.error("[leave] createLeaveRequest lỗi:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[leave] createLeaveRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateLeave();
  schedulePushDelivery();
  return { ok: true, data: null };
}

export async function cancelLeaveRequest(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: INVALID_ID };
  await requireRole("parent");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending").select("id");
    if (error) return { ok: false, error: dbErrorMessage(error) };
    if (!data.length) return { ok: false, error: "Đơn đã được cô xử lý nên không huỷ được nữa." };
  } catch (err) {
    console.error("[leave] cancelLeaveRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateLeave();
  return { ok: true, data: null };
}

/**
 * Giáo viên / quản trị: "Đồng ý" → DB tự ghi điểm danh "Nghỉ có phép" các ngày học trong đơn + báo phụ huynh.
 * Đồng ý → đổi thành từ chối (thu hồi) → các dòng điểm danh do đơn tạo được gỡ.
 */
export async function decideLeaveRequest(input: DecideLeaveInput): Promise<ActionResult<null>> {
  const parsed = decideLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("teacher", "admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status: v.decision, decision_note: v.note || null })
      .eq("id", v.id)
      .neq("status", "cancelled")
      .select("id, student_id");
    if (error) {
      console.error("[leave] decideLeaveRequest lỗi:", error);
      return { ok: false, error: error.code === "42501" ? "Bạn không phụ trách học sinh này." : dbErrorMessage(error) };
    }
    if (!data.length) return { ok: false, error: "Không tìm thấy đơn (có thể phụ huynh vừa huỷ)." };
    // Đồng ý / thu hồi → điểm danh "Nghỉ có phép" thay đổi
    revalidateTag(CACHE_TAGS.attendance(data[0]!.student_id));
  } catch (err) {
    console.error("[leave] decideLeaveRequest lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateLeave();
  schedulePushDelivery();
  return { ok: true, data: null };
}
