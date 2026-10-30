"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { normalizeContactPhone, replyFeedbackSchema, submitFeedbackSchema } from "./schema";
import { schedulePushDelivery } from "@/features/push/deliver";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";

/** Phụ huynh gửi phản hồi cho trung tâm. */
export async function submitFeedback(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = submitFeedbackSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  const profile = await requireRole("parent");
  const v = parsed.data;
  const limit = await rateLimit("submitForm", `feedback:${profile.id}`);
  if (!limit.ok) return formError(tooManyMessage(limit.retryAfter));

  try {
    const supabase = await createClient();
    // RPC: kiểm tra quyền trong DB; ẩn danh → người gửi lưu riêng, quản trị viên không thấy
    const { error } = await supabase.rpc("submit_feedback", {
      p_kind: v.kind,
      p_category: v.category,
      p_content: v.content,
      p_student_id: v.anonymous ? null : v.studentId,
      p_anonymous: v.anonymous,
      p_contact_name: v.anonymous ? null : v.contactName || null,
      p_contact_phone: v.anonymous ? null : normalizeContactPhone(v.contactPhone),
      p_wants_callback: !v.anonymous && v.wantsCallback,
    });
    if (error) {
      console.error("[feedback] submit lỗi:", error);
      if (error.code === "PGRST205" || error.code === "PGRST202") return formError("Chức năng góp ý đang được nhà trường cập nhật, vui lòng thử lại sau.");
      return formError(error.code === "42501" ? "Không gửi được góp ý cho học sinh này." : dbErrorMessage(error));
    }
  } catch (err) {
    console.error("[feedback] submit lỗi:", err);
    return formError(CONNECTION_ERROR);
  }

  schedulePushDelivery();
  revalidatePath("/parent/feedback");
  revalidatePath("/admin/feedback");
  return formSuccess(
    v.anonymous
      ? "Đã gửi ẩn danh tới Ban Giám đốc. Anh/chị vẫn xem được trả lời tại đây — nhà trường không biết người gửi."
      : "Đã gửi tới Ban Giám đốc TH EDU. Nhà trường sẽ phản hồi anh/chị trong thời gian sớm nhất.",
  );
}

/** Quản trị viên trả lời / đổi trạng thái phản hồi. */
export async function replyFeedback(id: string, reply: string, status: string): Promise<ActionResult<null>> {
  const parsed = replyFeedbackSchema.safeParse({ id, reply, status });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { data: current } = await supabase.from("feedback").select("admin_reply").eq("id", v.id).maybeSingle();
    if (!current) return { ok: false, error: "Không tìm thấy góp ý." };
    // Chỉ ghi người / thời điểm trả lời khi nội dung trả lời thực sự đổi (bấm "Hoàn tất" không làm sai mốc trả lời)
    const replyChanged = (current.admin_reply ?? "") !== v.reply;
    const { error } = await supabase
      .from("feedback")
      .update({
        status: v.status,
        ...(replyChanged && {
          admin_reply: v.reply || null,
          replied_by: v.reply ? profile.id : null,
          replied_at: v.reply ? new Date().toISOString() : null,
        }),
      })
      .eq("id", v.id);
    if (error) {
      console.error("[feedback] reply lỗi:", error);
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[feedback] reply lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  // Đẩy thông báo lên điện thoại (Web Push / Zalo ZNS) ngay sau khi phản hồi
  schedulePushDelivery();
  revalidatePath("/admin/feedback");
  revalidatePath("/parent/feedback");
  return { ok: true, data: null };
}
