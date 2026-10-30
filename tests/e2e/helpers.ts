import { expect, test, type Page } from "@playwright/test";

export type Role = "parent" | "teacher";

const CREDS: Record<Role, { login?: string; password?: string; path: string; home: string }> = {
  parent: { login: process.env.E2E_PARENT_LOGIN, password: process.env.E2E_PARENT_PASSWORD, path: "/login/parent", home: "/parent/dashboard" },
  teacher: { login: process.env.E2E_TEACHER_LOGIN, password: process.env.E2E_TEACHER_PASSWORD, path: "/login/teacher", home: "/teacher/dashboard" },
};

export const hasCredentials = (role: Role) => Boolean(CREDS[role].login && CREDS[role].password);

/** Bỏ qua test (không báo lỗi) khi chưa cấu hình tài khoản test trong .env.e2e. */
export function requireCredentials(...roles: Role[]) {
  const missing = roles.filter((r) => !hasCredentials(r));
  test.skip(missing.length > 0, `Thiếu tài khoản test (${missing.join(", ")}) — xem tests/README.md`);
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

export const LOGIN_PATHS = { parent: CREDS.parent.path, teacher: CREDS.teacher.path };
