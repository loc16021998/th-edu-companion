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

/**
 * Bản tin mới nhất trước: MỌI thông báo chưa đọc (tối đa `unreadLimit`) + `readLimit` thông báo đã đọc gần nhất.
 * Tách 2 truy vấn để tab "Mới" khớp số trên chuông: chỉ lấy 50 bản ghi mới nhất thì phụ huynh nhiều con, lâu không mở app
 * thấy "đã xem hết" trong khi chuông vẫn còn thông báo chưa đọc (vd. học phí) nằm ngoài 50 bản ghi đó.
 */
export async function listNotifications(userId: string, { unreadLimit = 200, readLimit = 50 } = {}): Promise<Notification[]> {
  const supabase = await createClient();
  const base = () =>
    supabase
      .from("notifications")
      .select("id, recipient_id, student_id, type, ref_date, ref_id, title, body, read_at, created_at, feedback_id")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false });
  const [unread, read] = await Promise.all([base().is("read_at", null).limit(unreadLimit), base().not("read_at", "is", null).limit(readLimit)]);
  const error = unread.error ?? read.error;
  if (error) throw new Error("Không tải được thông báo", { cause: error });
  return [...(unread.data ?? []), ...(read.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
