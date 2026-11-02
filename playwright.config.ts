import { readFileSync } from "node:fs";
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

const PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

/**
 * E2E_SUPABASE_URL (+ khoá) → app tự chạy với project Supabase THỬ NGHIỆM thay cho .env.local, build ra .next-e2e
 * (không đè bản build thật). Chặn nhầm: project thử nghiệm trùng project trong .env.local (dữ liệu thật) → dừng.
 */
// Chỉ lấy gốc https://<ref>.supabase.co (dán nhầm địa chỉ Data API ".../rest/v1/" vẫn chạy đúng)
const TEST_DB = process.env.E2E_SUPABASE_URL && new URL(process.env.E2E_SUPABASE_URL).origin;
if (TEST_DB) {
  let realUrl: string | undefined;
  try {
    realUrl = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {}
  if (realUrl && new URL(realUrl).hostname === new URL(TEST_DB).hostname) {
    throw new Error("E2E_SUPABASE_URL trùng project trong .env.local (dữ liệu thật) — hãy dùng project Supabase thử nghiệm riêng.");
  }
  // Tự chạy app (không có E2E_BASE_URL) → cần khoá của project thử nghiệm
  for (const k of process.env.E2E_BASE_URL ? [] : ["E2E_SUPABASE_ANON_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) throw new Error(`.env.e2e thiếu ${k} (lấy ở Supabase → Project Settings → API Keys của project thử nghiệm).`);
  }
}
const testDbEnv: Record<string, string> = TEST_DB
  ? {
      NEXT_PUBLIC_SUPABASE_URL: TEST_DB,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
      NEXT_DIST_DIR: ".next-e2e",
    }
  : {};

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
        env: testDbEnv,
        // Trỏ vào project thử nghiệm → luôn tự chạy server mới (không dùng nhầm server đang trỏ vào dữ liệu thật)
        reuseExistingServer: !process.env.CI && !TEST_DB,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
