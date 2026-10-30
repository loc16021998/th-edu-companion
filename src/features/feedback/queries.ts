import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Bảng / cột chưa tạo (chưa chạy migration) → trả về `available: false` thay vì làm hỏng trang. */
function isMissingTable(error: PostgrestError) {
  return error.code === "PGRST205" || error.code === "42P01" || error.code === "42703";
}

/**
 * Góp ý phụ huynh đã gửi, mới nhất trước. KHÔNG lọc theo parent_id: góp ý ẩn danh có parent_id = NULL —
 * RLS (feedback_parent_select) chỉ trả về góp ý đứng tên + ẩn danh do chính người này gửi.
 */
export async function listMyFeedback() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("id, kind, category, content, status, is_anonymous, wants_callback, admin_reply, replied_at, created_at, student:students(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTable(error)) return { available: false as const, items: [] };
    throw new Error("Không tải được phản hồi", { cause: error });
  }
  return { available: true as const, items: data };
}

export type MyFeedback = Awaited<ReturnType<typeof listMyFeedback>>["items"][number];

/** Toàn bộ góp ý cho quản trị viên, kèm phụ huynh + học sinh (ẩn danh: không có — RLS / ràng buộc DB). */
export async function listAllFeedback() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select(
      "id, kind, category, content, status, is_anonymous, contact_name, contact_phone, wants_callback, status_changed_at, admin_reply, replied_at, created_at, parent:profiles!feedback_parent_id_fkey(full_name, phone), student:students(full_name, class_name, campus)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    if (isMissingTable(error)) return { available: false as const, items: [] };
    throw new Error("Không tải được phản hồi", { cause: error });
  }
  return { available: true as const, items: data };
}

export type AdminFeedback = Awaited<ReturnType<typeof listAllFeedback>>["items"][number];
