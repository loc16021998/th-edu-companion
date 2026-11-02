import { expect, test, type Page } from "@playwright/test";

export type Role = "parent" | "teacher" | "admin";

const CREDS: Record<Role, { login?: string; password?: string; path: string; home: string }> = {
  parent: { login: process.env.E2E_PARENT_LOGIN, password: process.env.E2E_PARENT_PASSWORD, path: "/login/parent", home: "/parent/dashboard" },
  teacher: { login: process.env.E2E_TEACHER_LOGIN, password: process.env.E2E_TEACHER_PASSWORD, path: "/login/teacher", home: "/teacher/dashboard" },
  admin: { login: process.env.E2E_ADMIN_LOGIN, password: process.env.E2E_ADMIN_PASSWORD, path: "/admin/login", home: "/admin/dashboard" },
};

/**
 * Chỉ đăng nhập tài khoản test khi đã khai báo project Supabase THỬ NGHIỆM (E2E_SUPABASE_URL — playwright.config.ts
 * kiểm tra nó khác project dữ liệu thật và tự chạy app với project đó; test bản staging qua E2E_BASE_URL thì vẫn khai báo
 * URL project của staging). Không bao giờ chạy kịch bản đăng nhập / ghi dữ liệu vào database thật chỉ vì có sẵn mật khẩu.
 */
const ISOLATED = Boolean(process.env.E2E_SUPABASE_URL);

export const hasCredentials = (role: Role) => ISOLATED && Boolean(CREDS[role].login && CREDS[role].password);

/** Bỏ qua test (không báo lỗi) khi chưa cấu hình tài khoản test / project thử nghiệm trong .env.e2e. */
export function requireCredentials(...roles: Role[]) {
  test.skip(!ISOLATED, "Chưa trỏ vào project Supabase thử nghiệm (E2E_SUPABASE_URL) — xem tests/README.md");
  const missing = roles.filter((r) => !hasCredentials(r));
  test.skip(missing.length > 0, `Thiếu tài khoản test (${missing.join(", ")}) — xem tests/README.md`);
}

/** Kịch bản GHI dữ liệu: chỉ khi E2E_ALLOW_WRITES=1. */
export function requireWrites() {
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Kịch bản ghi dữ liệu — đặt E2E_ALLOW_WRITES=1 (chỉ trên Supabase thử nghiệm)");
}

/** Đăng nhập qua giao diện như người dùng thật; chờ tới trang chủ của vai trò. */
export async function login(page: Page, role: Role) {
  const c = CREDS[role];
  await page.goto(c.path);
  await page.locator("#identifier").fill(c.login!);
  await page.locator("#password").fill(c.password!);
  await page.getByRole("button", { name: /^Đăng nhập/ }).click();
  await expect(page).toHaveURL(new RegExp(`${c.home}(\\?|$)`), { timeout: 30_000 });
}

export const LOGIN_PATHS = { parent: CREDS.parent.path, teacher: CREDS.teacher.path, admin: CREDS.admin.path };

/**
 * Theo dõi lỗi khi dùng trang: lỗi JavaScript, phản hồi 5xx, lỗi CSP. Gọi `problems()` để lấy danh sách.
 * (Lỗi 4xx của Supabase khi không có quyền là bình thường — không tính.)
 */
export function watchProblems(page: Page) {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push(`Lỗi JS: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 500) list.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && /Content Security Policy|Hydration|hydrat/i.test(t)) list.push(`Console: ${t.slice(0, 300)}`);
  });
  return () => [...list];
}

/** Trang hiển thị bình thường: không tràn ngang, không rơi vào màn hình lỗi, không bị đẩy về trang đăng nhập. */
export async function expectHealthyPage(page: Page, path: string, { heading = true }: { heading?: boolean } = {}) {
  await expect(page, `${path} bị chuyển về trang đăng nhập`).not.toHaveURL(/\/login(\?|\/|$)/);
  await expect(page.getByText(/Ối, trang chưa tải được|Ứng dụng đã có phiên bản mới|Đã có lỗi xảy ra|Application error/i), `${path} hiện màn hình lỗi`).toHaveCount(0);
  if (heading) await expect(page.locator("main").getByRole("heading").first(), `${path} không có tiêu đề`).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} tràn ngang ${overflow}px trên điện thoại`).toBeLessThanOrEqual(1);
}
