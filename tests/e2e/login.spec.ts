import { expect, test } from "@playwright/test";
import { LOGIN_PATHS, login, requireCredentials } from "./helpers";

test.describe("Đăng nhập", () => {
  test("phụ huynh đăng nhập → /parent/dashboard", async ({ page }) => {
    requireCredentials("parent");
    await login(page, "parent");
    await expect(page.getByText("Hôm nay của con")).toBeVisible();
    // Thanh tab đáy của phụ huynh
    await expect(page.getByRole("navigation", { name: "Điều hướng phụ huynh" })).toBeVisible();
  });

  test("giáo viên đăng nhập → /teacher/dashboard", async ({ page }) => {
    requireCredentials("teacher");
    await login(page, "teacher");
    await expect(page.getByRole("navigation", { name: "Điều hướng giáo viên" })).toBeVisible();
  });

  test("đã đăng nhập phụ huynh mà mở khu giáo viên → bị chuyển về khu phụ huynh", async ({ page }) => {
    requireCredentials("parent");
    await login(page, "parent");
    await page.goto("/teacher/dashboard");
    await expect(page).toHaveURL(/\/parent\/dashboard/);
  });

  test("sai mật khẩu → báo lỗi, ở lại trang đăng nhập", async ({ page }) => {
    requireCredentials("parent");
    await page.goto(LOGIN_PATHS.parent);
    await page.locator("#identifier").fill(process.env.E2E_PARENT_LOGIN!);
    await page.locator("#password").fill("sai-mat-khau-e2e");
    await page.getByRole("button", { name: /^Đăng nhập/ }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(LOGIN_PATHS.parent));
  });
});
