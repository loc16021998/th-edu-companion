import { expect, test } from "@playwright/test";
import { expectHealthyPage, login, requireCredentials, watchProblems, type Role } from "./helpers";

/**
 * Đi qua MỌI trang của từng vai trò sau khi đăng nhập (chỉ đọc, không ghi dữ liệu):
 * không lỗi JS / 5xx / CSP / hydration, không rơi vào màn hình lỗi, không tràn ngang trên điện thoại.
 * Thêm trang mới → thêm đường dẫn vào đây.
 */
const PAGES: Record<Role, string[]> = {
  parent: [
    "/parent/dashboard",
    "/parent/notifications",
    "/parent/announcements",
    "/parent/moments",
    "/parent/progress",
    "/parent/achievements",
    "/parent/homework",
    "/parent/attendance",
    "/parent/schedule",
    "/parent/fees",
    "/parent/booking",
    "/parent/leave-request",
    "/parent/campuses",
    "/parent/feedback",
    "/parent/ai-assistant",
    "/parent/chat",
    "/parent/me",
    "/parent/account",
  ],
  teacher: [
    "/teacher/dashboard",
    "/teacher/schedule",
    "/teacher/attendance",
    "/teacher/daily-report",
    "/teacher/grading",
    "/teacher/achievements",
    "/teacher/moments",
    "/teacher/student-analytics",
    "/teacher/leave-requests",
    "/teacher/availability",
    "/teacher/trials",
    "/teacher/notifications",
    "/teacher/chat",
    "/teacher/account",
  ],
  admin: [
    "/admin/dashboard",
    "/admin/notifications",
    "/admin/analytics",
    "/admin/management",
    "/admin/admissions",
    "/admin/admissions/trials",
    "/admin/announcements",
    "/admin/chat",
    "/admin/ai-knowledge",
    "/admin/consultations",
    "/admin/classes",
    "/admin/campuses",
    "/admin/shifts",
    "/admin/students",
    "/admin/attendance",
    "/admin/leave-requests",
    "/admin/daily-report",
    "/admin/daily-report/ai",
    "/admin/homework",
    "/admin/moments",
    "/admin/grading",
    "/admin/achievements",
    "/admin/achievements/settings",
    "/admin/student-analytics",
    "/admin/teacher-attendance",
    "/admin/payroll",
    "/admin/payroll/settings",
    "/admin/finance",
    "/admin/fees",
    "/admin/feedback",
    "/admin/accounts",
    "/admin/notifications-settings",
    "/admin/system",
    "/admin/audit-logs",
    "/admin/account",
    "/admin/passwords/parent",
    "/admin/passwords/teacher",
  ],
};

/** Trang chat toàn màn hình không có tiêu đề trong <main>. */
const NO_HEADING = /\/chat$/;

for (const role of ["parent", "teacher", "admin"] as const) {
  test(`${role}: mọi trang mở được, không lỗi`, async ({ page }) => {
    requireCredentials(role);
    test.setTimeout(60_000 + PAGES[role].length * 15_000);
    await login(page, role);
    const problems = watchProblems(page);
    const failures: string[] = [];
    for (const path of PAGES[role]) {
      await test.step(path, async () => {
        const before = problems().length;
        const res = await page.goto(path, { waitUntil: "networkidle" });
        expect(res?.status(), `${path} trả mã ${res?.status()}`).toBeLessThan(400);
        await expectHealthyPage(page, path, { heading: !NO_HEADING.test(path) });
        const fresh = problems().slice(before);
        if (fresh.length) failures.push(`${path}\n  ${fresh.join("\n  ")}`);
      });
    }
    expect(failures, `Lỗi khi mở trang:\n${failures.join("\n")}`).toEqual([]);
  });
}
