import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH, ROLE_HOME, loginPathForRole, type Role } from "@/lib/auth/routes";
import type { Tables } from "@/types/database.types";

/** Thông tin đăng nhập tối thiểu lấy từ JWT (không cần gọi Supabase Auth qua mạng). */
export type AuthUser = { id: string; email: string | null; phone: string | null };
export type AuthContext = { user: AuthUser; profile: Tables<"profiles"> };

/**
 * User + profile hiện tại, cache trong phạm vi 1 request (layout, page, action dùng chung).
 *  - Trả về null : chưa đăng nhập, session hết hạn, hoặc chưa có profile.
 *  - Throw       : lỗi hạ tầng (mạng, DB) → error.tsx hiển thị, không âm thầm đăng xuất user.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();

  // getClaims() xác minh chữ ký JWT ngay trên server (khoá công khai được cache) — không tốn 1 lượt gọi
  // Supabase Auth như getUser() ở MỖI lần chuyển trang. Dữ liệu vẫn được RLS bảo vệ theo chính JWT này.
  const { data, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError) {
    if (isAuthRetryableFetchError(claimsError) || (claimsError.status ?? 0) >= 500) {
      throw new Error("Không xác thực được phiên đăng nhập", { cause: claimsError });
    }
    return null; // 4xx: không có session / token không hợp lệ
  }
  if (!data?.claims.sub) return null;
  const { claims } = data;
  const user: AuthUser = { id: claims.sub, email: claims.email || null, phone: claims.phone || null };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, campus, avatar_url, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("Không tải được hồ sơ người dùng", { cause: profileError });

  return profile ? { user, profile } : null;
});

/**
 * Guard cho layout/page/server action (lớp bảo vệ thứ 2 sau middleware).
 * Chưa đăng nhập → /login; sai vai trò → dashboard của vai trò đó.
 */
export async function requireRole(...roles: Role[]): Promise<Tables<"profiles">> {
  const ctx = await getAuthContext();
  if (!ctx) {
    // Mỗi vai trò có trang đăng nhập riêng; nhiều vai trò → trang chọn
    const loginPath = roles.length === 1 && roles[0] ? loginPathForRole(roles[0]) : LOGIN_PATH;
    redirect(`${loginPath}?error=session_expired`);
  }
  if (!roles.includes(ctx.profile.role)) redirect(ROLE_HOME[ctx.profile.role]);
  return ctx.profile;
}
