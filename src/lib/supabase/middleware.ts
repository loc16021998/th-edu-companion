import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { env } from "@/lib/env";
import { ADMIN_LOGIN_PATH, ROLE_HOME, canAccess, getProtectedArea, isLoginPath, loginPathFor, type Role } from "@/lib/auth/routes";

/**
 * Chạy trên Edge cho mọi request:
 *  1. Xác thực + refresh session Supabase (ghi lại cookie mới).
 *  2. Chưa đăng nhập → chặn /admin/*, /teacher/*, /parent/* và chuyển về /login?next=...
 *  3. Đã đăng nhập → đọc role từ bảng profiles, điều hướng về dashboard đúng vai trò
 *     và chặn truy cập khu vực của vai trò khác.
 *
 * Đây là lớp điều hướng/UX. Lớp bảo vệ dữ liệu thật sự là RLS + requireRole() trong layout.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Không chèn logic giữa createServerClient và getClaims() — dễ gây lỗi mất session ngẫu nhiên.
  // getClaims() xác minh chữ ký JWT (không tin cookie mù quáng như getSession()).
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data) userId = data.claims.sub;
  } catch (err) {
    console.error("[middleware] Xác thực session thất bại:", err);
  }

  const { pathname, search } = request.nextUrl;
  const area = getProtectedArea(pathname);
  const isLoginPage = isLoginPath(pathname);

  // ---- Chưa đăng nhập ------------------------------------------------------
  if (!userId) {
    if (area) return redirectTo(request, response, loginPathFor(pathname), { next: pathname + search });
    // Mở trang gốc khi chưa đăng nhập → trang đăng nhập quản trị (phụ huynh/giáo viên dùng /login)
    if (pathname === "/") return redirectTo(request, response, ADMIN_LOGIN_PATH);
    return response;
  }

  // ---- Đã đăng nhập: chỉ tra role khi cần quyết định điều hướng ------------
  if (!area && !isLoginPage && pathname !== "/") return response;
  // Chuyển trang phía client (RSC / prefetch) bên trong khu vực: bỏ lượt tra profiles để chuyển trang tức thì.
  // Lần tải trang đầu đã kiểm tra vai trò ở đây; requireRole() trong layout vẫn chặn nếu sai vai trò.
  const isClientNav = request.headers.get("rsc") === "1" || request.headers.has("next-router-prefetch");
  if (area && isClientNav && pathname !== area) return response;

  let role: Role | null;
  try {
    const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) throw error;
    role = data?.role ?? null;
  } catch (err) {
    // Lỗi tạm thời (mạng/DB): không chặn cứng ở Edge — requireRole() trong layout sẽ
    // kiểm tra lại và hiển thị error boundary; RLS vẫn bảo vệ dữ liệu.
    console.error("[middleware] Không tải được profile:", err);
    return response;
  }

  // Có session nhưng chưa có profile (chưa được cấp quyền)
  if (!role) {
    return isLoginPage ? response : redirectTo(request, response, loginPathFor(pathname), { error: "no_profile" });
  }

  const home = ROLE_HOME[role];
  // Phụ huynh / giáo viên mở trang đăng nhập quản trị (vd. bấm logo trên header) → cho đăng nhập bằng tài khoản quản trị
  if (pathname === ADMIN_LOGIN_PATH && role !== "admin") return response;
  if (isLoginPage || pathname === "/") return redirectTo(request, response, home);
  // Không phải quản trị mà vào khu /admin → trang đăng nhập quản trị (kèm thông báo), không âm thầm quay về
  if (area === "/admin" && role !== "admin") {
    return redirectTo(request, response, ADMIN_LOGIN_PATH, { next: pathname + search, error: "admin_only" });
  }
  if (area && !canAccess(role, pathname)) return redirectTo(request, response, home);
  // /admin, /teacher, /parent → trang tổng quan; /chat có trang riêng (tự chuyển theo vai trò)
  if (area && area !== "/chat" && pathname === area) return redirectTo(request, response, `${area}/dashboard`);

  return response;
}

/** Redirect nhưng giữ lại cookie session vừa refresh — nếu mất, user bị đăng xuất ngẫu nhiên. */
function redirectTo(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
  params?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
