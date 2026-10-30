import { defineConfig, devices } from "@playwright/test";

/**
 * Kiểm thử E2E (Playwright). Hướng dẫn: tests/README.md.
 * Tài khoản test + tuỳ chọn đọc từ .env.e2e (không commit). NÊN trỏ vào project Supabase thử nghiệm (staging):
 * kịch bản điểm danh GHI dữ liệu (rồi khôi phục trạng thái cũ).
 */
try {
  process.loadEnvFile(".env.e2e");
} catch {
  // Không có file → chỉ chạy các test không cần đăng nhập
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.results",
  fullyParallel: false, // các kịch bản dùng chung tài khoản test → chạy tuần tự cho ổn định
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "tests/e2e/.report" }]] : [["list"], ["html", { open: "never", outputFolder: "tests/e2e/.report" }]],
  use: {
    baseURL,
    // Dùng Chrome đã cài trên máy (không cần `npx playwright install`); CI có thể đặt PW_CHANNEL="" để dùng Chromium tải về
    channel: process.env.PW_CHANNEL ?? "chrome",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Phụ huynh / giáo viên chủ yếu dùng điện thoại
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" },
    },
  ],
  // Tự build + chạy bản production (bỏ qua khi E2E_BASE_URL trỏ tới server có sẵn / bản deploy staging)
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
