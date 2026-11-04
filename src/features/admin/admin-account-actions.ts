"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { rateLimit, rateLimitPeek, resetRateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { AccountError, createUserAccount, logAdminAccountChange, removeAdminAccount, verifyOwnPassword } from "./accounts";
import { createAdminSchema, removeAdminSchema } from "./schema";

/**
 * Tài khoản QUẢN TRỊ — chỉ ở trang Quản trị → Tài khoản quản trị.
 * Mỗi thao tác: đúng vai trò quản trị + nhập lại mật khẩu của chính mình (giới hạn số lần sai) + ghi Nhật ký & bảo mật.
 */

const WRONG_PASSWORD = "Mật khẩu xác nhận không đúng.";

/** Xác nhận lại mật khẩu của người đang thao tác. Trả về thông báo lỗi, hoặc null nếu đúng. */
async function stepUp(profile: { id: string }, password: string): Promise<string | null> {
  const key = `admin-stepup:${profile.id}`;
  const peek = await rateLimitPeek("changePassword", key);
  if (!peek.ok) return tooManyMessage(peek.retryAfter);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.id !== profile.id) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (await verifyOwnPassword({ email: data.user.email, phone: data.user.phone ? `+${data.user.phone.replace(/^\+/, "")}` : null }, password)) {
    await resetRateLimit("changePassword", key);
    return null;
  }
  await rateLimit("changePassword", key); // chỉ đếm lần nhập SAI
  return WRONG_PASSWORD;
}

function revalidate() {
  revalidatePath("/admin/admins");
  revalidatePath("/admin/audit-logs");
}

export async function createAdminAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createAdminSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  const profile = await requireRole("admin");
  const v = parsed.data;

  const stepUpError = await stepUp(profile, v.currentPassword);
  if (stepUpError) return formError(stepUpError, stepUpError === WRONG_PASSWORD ? { currentPassword: WRONG_PASSWORD } : undefined);

  try {
    const id = await createUserAccount(v, "admin", null);
    await logAdminAccountChange(profile, "CREATE", { id, full_name: v.fullName, email: v.email, phone: v.phone });
  } catch (err) {
    if (err instanceof AccountError) return formError(err.message);
    console.error("[admin] createAdminAccount lỗi:", err);
    return formError("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }
  revalidate();
  const login = [v.phone ? `SĐT ${v.phone.replace(/^\+84/, "0")}` : null, v.email].filter(Boolean).join(" hoặc ");
  return formSuccess(`Đã tạo tài khoản quản trị cho ${v.fullName}. Đăng nhập tại trang Quản trị bằng ${login} và mật khẩu vừa đặt.`);
}

export async function removeAdminAccountAction(input: { userId: string; currentPassword: string }): Promise<ActionResult<null>> {
  const parsed = removeAdminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");

  const stepUpError = await stepUp(profile, parsed.data.currentPassword);
  if (stepUpError) return { ok: false, error: stepUpError };

  try {
    const removed = await removeAdminAccount(parsed.data.userId, profile.id);
    await logAdminAccountChange(profile, "DELETE", { id: parsed.data.userId, full_name: removed.full_name });
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    console.error("[admin] removeAdminAccount lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }
  revalidate();
  return { ok: true, data: null };
}
