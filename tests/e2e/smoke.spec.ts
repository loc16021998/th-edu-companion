import { expect, test } from "@playwright/test";

// Không cần tài khoản, không ghi dữ liệu — chạy được mọi lúc (kể cả trên bản production).

test.describe("Bảo vệ trang & trang đăng nhập", () => {
  for (const [area, login] of [
    ["parent", "/login/parent"],
    ["teacher", "/login/teacher"],
  ] as const) {
    test(`chưa đăng nhập vào /${area}/dashboard → chuyển tới ${login}`, async ({ page }) => {
      await page.goto(`/${area}/dashboard`);
      await expect(page).toHaveURL(new RegExp(`${login}\\?next=%2F${area}%2Fdashboard`));
      await expect(page.locator("#identifier")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Đăng nhập/ })).toBeVisible();
    });
  }

  test("khu quản trị chuyển tới trang đăng nhập quản trị", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("ô mật khẩu ẩn / hiện được", async ({ page }) => {
    await page.goto("/login/parent");
    const password = page.locator("#password");
    await password.fill("matkhau123");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Hiện mật khẩu" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });
});

test("health check trả trạng thái hệ thống", async ({ request }) => {
  const res = await request.get("/api/health");
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(["ok", "degraded", "down"]).toContain(body.status);
  expect(Object.keys(body.checks)).toEqual(expect.arrayContaining(["database", "auth", "storage"]));
});
