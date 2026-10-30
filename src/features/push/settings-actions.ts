"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { deliverPendingNotifications } from "./deliver";

const urlSchema = z
  .string()
  .trim()
  .url("Địa chỉ không hợp lệ")
  .refine((u) => u.startsWith("https://"), "Supabase chỉ gọi được địa chỉ HTTPS công khai (đã triển khai lên mạng)")
  .refine((u) => !/\/\/(localhost|127\.|192\.168\.|10\.)/.test(u), "Địa chỉ nội bộ (localhost / mạng LAN) — Supabase không gọi tới được");

/**
 * Lưu URL + mã bí mật để trigger DB (pg_net) tự gọi /api/push/dispatch khi có thông báo mới.
 * `appUrl`: tên miền đã triển khai, vd https://app.thedu.vn
 */
export async function connectAutoDispatch(appUrl: string): Promise<ActionResult<{ url: string }>> {
  const profile = await requireRole("admin");
  const parsed = urlSchema.safeParse(appUrl.replace(/\/+$/, ""));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Địa chỉ không hợp lệ" };
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return { ok: false, error: "Server chưa có PUSH_DISPATCH_SECRET (≥ 32 ký tự) trong biến môi trường." };

  const url = `${parsed.data}/api/push/dispatch`;
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "push_dispatch_url", value: url, updated_by: profile.id, updated_at: new Date().toISOString() },
      { key: "push_dispatch_secret", value: secret, updated_by: profile.id, updated_at: new Date().toISOString() },
    ],
    { onConflict: "key" },
  );
  if (error) {
    if (error.code === "PGRST205") return { ok: false, error: "Database chưa cập nhật — chạy file supabase/apply-push-autodispatch.sql." };
    console.error("[push] Lưu cấu hình tự động thất bại:", error);
    return { ok: false, error: "Không lưu được cấu hình. Vui lòng thử lại." };
  }
  revalidatePath("/admin/notifications-settings");
  return { ok: true, data: { url } };
}

export async function disconnectAutoDispatch(): Promise<ActionResult<null>> {
  await requireRole("admin");
  const supabase = await createClient();
  await supabase.from("app_settings").delete().in("key", ["push_dispatch_url", "push_dispatch_secret"]);
  revalidatePath("/admin/notifications-settings");
  return { ok: true, data: null };
}

/** Gửi ngay các thông báo đang chờ (kiểm tra thủ công). */
export async function dispatchNow(): Promise<ActionResult<{ pushed: number; outbound: number }>> {
  await requireRole("admin");
  const result = await deliverPendingNotifications();
  revalidatePath("/admin/notifications-settings");
  return { ok: true, data: result };
}
