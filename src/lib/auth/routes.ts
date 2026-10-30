// Quy tắc định tuyến theo vai trò — module thuần, chạy được cả ở Edge (middleware) lẫn Node.
import type { Enums } from "@/types/database.types";

export type Role = Enums<"roles">;

/** Trang chọn: "Tôi là phụ huynh / Tôi là giáo viên". */
export const LOGIN_PATH = "/login";
/** Đăng nhập riêng của phụ huynh. */
export const PARENT_LOGIN_PATH = "/login/parent";
/** Đăng nhập riêng của giáo viên. */
export const TEACHER_LOGIN_PATH = "/login/teacher";
/** Đăng nhập riêng của quản trị viên (tách khỏi giao diện phụ huynh/giáo viên). */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Khu vực nội bộ → các vai trò được phép truy cập. */
export const PROTECTED_AREAS = {
  "/admin": ["admin"],
  "/teacher": ["teacher"],
  "/parent": ["parent"],
  // Kênh chat chung: /chat tự chuyển tới /parent/chat hoặc /teacher/chat
  "/chat": ["parent", "teacher"],
} as const satisfies Record<string, readonly Role[]>;

export type ProtectedArea = keyof typeof PROTECTED_AREAS;

/** Trang mặc định sau khi đăng nhập. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  parent: "/parent/dashboard",
};

export function getProtectedArea(pathname: string): ProtectedArea | null {
  if (pathname === ADMIN_LOGIN_PATH) return null;
  for (const area of Object.keys(PROTECTED_AREAS) as ProtectedArea[]) {
    if (pathname === area || pathname.startsWith(`${area}/`)) return area;
  }
  return null;
}

export function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`) || pathname === ADMIN_LOGIN_PATH;
}

/** Trang đăng nhập của một vai trò (dùng khi đăng xuất / hết phiên). */
export function loginPathForRole(role: Role): string {
  return { admin: ADMIN_LOGIN_PATH, teacher: TEACHER_LOGIN_PATH, parent: PARENT_LOGIN_PATH }[role];
}

/** Trang đăng nhập phù hợp với khu vực đang định vào (chưa rõ khu vực → trang chọn). */
export function loginPathFor(pathname: string): string {
  const area = getProtectedArea(pathname);
  if (area === "/admin") return ADMIN_LOGIN_PATH;
  if (area === "/teacher") return TEACHER_LOGIN_PATH;
  if (area === "/parent") return PARENT_LOGIN_PATH;
  return LOGIN_PATH;
}

export function canAccess(role: Role, pathname: string): boolean {
  const area = getProtectedArea(pathname);
  if (!area) return true;
  const allowed: readonly Role[] = PROTECTED_AREAS[area];
  return allowed.includes(role);
}

/** Chỉ chấp nhận đường dẫn nội bộ — chống open redirect qua tham số ?next=. */
export function sanitizeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Đích đến sau đăng nhập: ưu tiên ?next= nếu an toàn và đúng quyền, ngược lại về trang chủ vai trò. */
export function resolvePostLoginPath(role: Role, next?: string | null): string {
  const safe = sanitizeNextPath(next);
  if (safe && safe !== "/" && !isLoginPath(safe.split("?")[0] ?? safe) && canAccess(role, safe)) return safe;
  return ROLE_HOME[role];
}
