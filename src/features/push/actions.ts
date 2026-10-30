"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendPushToUsers } from "@/lib/push/server";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof subscriptionSchema>;

const NOT_READY = "Máy chủ chưa cấu hình thông báo đẩy (VAPID / SUPABASE_SERVICE_ROLE_KEY). Vui lòng liên hệ quản trị viên.";

/** Lưu thiết bị vừa bật thông báo. Máy dùng chung đổi tài khoản → thiết bị chuyển sang tài khoản mới. */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<ActionResult<null>> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Thông tin thiết bị không hợp lệ." };
  const profile = await requireRole("parent", "teacher", "admin");
  if (!pushConfigured()) return { ok: false, error: NOT_READY };
  const v = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { user_id: profile.id, endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, user_agent: v.userAgent ?? null },
      { onConflict: "endpoint" },
    );
  if (error) {
    if (error.code === "PGRST205") return { ok: false, error: "Database chưa cập nhật — chạy file supabase/apply-leave-chat-push.sql." };
    console.error("[push] Lưu thiết bị thất bại:", error);
    return { ok: false, error: "Không lưu được thiết bị. Vui lòng thử lại." };
  }
  return { ok: true, data: null };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult<null>> {
  if (!subscriptionSchema.shape.endpoint.safeParse(endpoint).success) return { ok: false, error: "Thông tin thiết bị không hợp lệ." };
  const profile = await requireRole("parent", "teacher", "admin");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: true, data: null };
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.id);
  return { ok: true, data: null };
}

export async function sendTestPush(): Promise<ActionResult<{ devices: number }>> {
  const profile = await requireRole("parent", "teacher", "admin");
  if (!pushConfigured()) return { ok: false, error: NOT_READY };
  const devices = await sendPushToUsers([profile.id], () => ({
    title: "TH EDU Companion",
    body: "Thông báo đã được bật trên thiết bị này 🎉",
    url: profile.role === "teacher" ? "/teacher/dashboard" : profile.role === "admin" ? "/admin/dashboard" : "/parent/dashboard",
    tag: "thedu-test",
  }));
  return devices ? { ok: true, data: { devices } } : { ok: false, error: "Chưa gửi được — hãy tắt rồi bật lại thông báo." };
}
