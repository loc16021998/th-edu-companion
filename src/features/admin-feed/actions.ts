"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";

/** "Đánh dấu đã xem tất cả" (chuông về 0). */
export async function markAdminFeedSeen(): Promise<ActionResult<null>> {
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_notification_state")
    .upsert({ admin_id: profile.id, last_seen_at: new Date().toISOString() }, { onConflict: "admin_id" });
  if (error && error.code !== "PGRST205") console.error("[admin-feed] Không lưu được mốc đã xem:", error);
  revalidatePath("/admin", "layout");
  return { ok: true, data: null };
}

/** Bấm vào 1 thông báo (trên trang hoặc thông báo nhỏ góc màn hình) → mục đó không còn là mới. */
export async function markAdminFeedItemRead(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: "Thông báo không hợp lệ." };
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_notification_reads")
    .upsert({ admin_id: profile.id, notification_id: id, read_at: new Date().toISOString() }, { onConflict: "admin_id,notification_id" });
  if (error) {
    if (error.code === "PGRST205") return { ok: false, error: "Database chưa cập nhật — chạy file supabase/apply-admin-feed-reads.sql." };
    console.error("[admin-feed] Không đánh dấu được đã xem:", error);
    return { ok: false, error: "Không đánh dấu được đã xem." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, data: null };
}

/**
 * Quản trị viên đã mở trang xử lý (vd. 1 cuộc trò chuyện, trang Phản hồi, Đơn xin nghỉ) →
 * các thông báo liên quan coi như đã xem. `groupKey`: đúng nhóm (vd. "chat:<id>"); `category`: cả loại.
 */
const readForSchema = z
  .object({ groupKey: z.string().min(1).max(200).optional(), category: z.string().min(1).max(40).optional() })
  .strict()
  .refine((t) => t.groupKey || t.category, "Thiếu điều kiện.");

export async function markAdminFeedReadFor(input: { groupKey?: string; category?: string }): Promise<ActionResult<{ marked: number }>> {
  const parsed = readForSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Thiếu điều kiện." };
  const target = parsed.data;
  const profile = await requireRole("admin");
  const supabase = await createClient();
  let query = supabase.from("admin_notifications").select("id").order("updated_at", { ascending: false }).limit(300);
  if (target.groupKey) query = query.eq("group_key", target.groupKey);
  if (target.category) query = query.eq("category", target.category);
  const { data, error } = await query;
  if (error || !data.length) return { ok: true, data: { marked: 0 } };
  const now = new Date().toISOString();
  const { error: upError } = await supabase
    .from("admin_notification_reads")
    .upsert(data.map((n) => ({ admin_id: profile.id, notification_id: n.id, read_at: now })), { onConflict: "admin_id,notification_id" });
  if (upError) {
    if (upError.code !== "PGRST205") console.error("[admin-feed] Không đánh dấu được đã xem:", upError);
    return { ok: true, data: { marked: 0 } };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, data: { marked: data.length } };
}
