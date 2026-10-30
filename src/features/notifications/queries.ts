import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Notification = Omit<Tables<"notifications">, "pushed_at">;

/**
 * Số thông báo chưa đọc của user hiện tại (RLS: chỉ thấy thông báo của mình).
 * Không throw: lỗi đếm thông báo không được làm hỏng cả khung dashboard → trả 0, chuông tự đồng bộ lại sau.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error("[notifications] Không đếm được thông báo chưa đọc:", err);
    return 0;
  }
}

/** Bản tin mới nhất trước. */
export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, student_id, type, ref_date, ref_id, title, body, read_at, created_at, feedback_id")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Không tải được thông báo", { cause: error });
  return data;
}
