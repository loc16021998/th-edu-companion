import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { env } from "@/lib/env";

/**
 * Client dùng service_role — BỎ QUA RLS.
 * Chỉ dùng cho tác vụ quản trị phía server (mời phụ huynh, tạo tài khoản giáo viên...).
 * Luôn kiểm tra quyền (requireRole("admin")) trước khi gọi.
 */
let instance: { key: string; client: ReturnType<typeof createClient<Database>> } | null = null;

/**
 * Dùng chung 1 client trong tiến trình (không giữ phiên đăng nhập / cookie nên an toàn khi dùng chung giữa các request);
 * tạo lại nếu khoá đổi. Tránh dựng client mới ở mỗi lần gọi (đếm push, ghi nhật ký lỗi, tạo tài khoản…).
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY");

  if (instance?.key !== serviceRoleKey) {
    instance = {
      key: serviceRoleKey,
      client: createClient<Database>(env.supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      }),
    };
  }
  return instance.client;
}
