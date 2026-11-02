import { expect, test, type Page } from "@playwright/test";
import { login, requireCredentials, requireWrites } from "./helpers";

/**
 * Các luồng chính sau đăng nhập. Dữ liệu dựng bởi supabase/seed/demo.sql + seed/e2e.sql (xem tests/README.md):
 * bé An (E2E_CHILD_ID) có khoản học phí chưa đóng; trung tâm đã cấu hình tài khoản nhận học phí;
 * cô chủ nhiệm (giáo viên test) mở khung giờ tư vấn mọi ngày.
 */
const CHILD_ID = process.env.E2E_CHILD_ID;
const withChild = (path: string) => (CHILD_ID ? `${path}?${new URLSearchParams({ child: CHILD_ID })}` : path);

test.describe("Phụ huynh — học phí", () => {
  test("Thanh toán ngay: mã VietQR + tự viết nội dung chuyển khoản (luôn giữ mã học sinh)", async ({ page }) => {
    requireCredentials("parent");
    await login(page, "parent");
    await page.goto(withChild("/parent/fees"));
    await page.getByRole("button", { name: /Thanh toán ngay/ }).first().click();

    const sheet = page.getByRole("dialog", { name: "Thanh toán học phí" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("img", { name: /Mã VietQR chuyển/ })).toBeVisible();

    const note = sheet.locator("#transfer-note");
    await note.fill("Học phí tháng 11 bé An");
    await expect(sheet.getByText(/Sẽ gửi:/)).toContainText(/TH\d{5} - HOC PHI THANG 11 BE AN/);

    await sheet.getByRole("button", { name: /Dùng nội dung gợi ý/ }).click();
    await expect(note).not.toHaveValue("Học phí tháng 11 bé An");

    // Khung cố định: tiêu đề đứng yên, chỉ phần nội dung cuộn
    const titleTop = await sheet.getByRole("heading", { name: "Thanh toán học phí" }).evaluate((h) => h.getBoundingClientRect().top);
    await sheet.getByRole("link", { name: /Lưu ảnh QR/ }).scrollIntoViewIfNeeded();
    await expect(sheet.getByRole("link", { name: /Lưu ảnh QR/ })).toBeInViewport();
    expect(await sheet.getByRole("heading", { name: "Thanh toán học phí" }).evaluate((h) => h.getBoundingClientRect().top)).toBe(titleTop);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("Thông báo học phí → mở thẳng mã QR (hoặc báo đã đóng đủ)", async ({ page }) => {
    requireCredentials("parent");
    await login(page, "parent");
    await page.goto(withChild("/parent/notifications"));
    // Đã mở trang Học phí (test trước) → thông báo học phí đã được đánh dấu đọc, nằm ở tab "Đã xem"
    const feeNotice = page.getByRole("button").filter({ hasText: "Chạm để mở mã QR" }).first();
    await expect(page.getByRole("tablist", { name: "Lọc thông báo" })).toBeVisible();
    if (!(await feeNotice.isVisible())) await page.getByRole("tab", { name: "Đã xem" }).click();
    await feeNotice.click();

    await expect(page).toHaveURL(/\/parent\/fees\?.*pay=/);
    await expect(page.getByRole("dialog", { name: "Thanh toán học phí" }).or(page.getByRole("status").filter({ hasText: "đã được thanh toán đủ" }))).toBeVisible();
  });
});

test("Bản tin: tab 'Mới' có đủ thông báo chưa đọc như số trên chuông", async ({ page }) => {
  requireCredentials("parent");
  await login(page, "parent");
  await page.goto("/parent/notifications");
  const bell = await page.getByRole("link", { name: /Thông báo, \d+ chưa đọc/ }).getAttribute("aria-label");
  const unread = Number(/(\d+) chưa đọc/.exec(bell ?? "")?.[1]);
  test.skip(!unread, "Không còn thông báo chưa đọc để so");
  await expect(page.getByRole("tab", { name: new RegExp(`^Mới \\(${Math.min(unread, 200)}\\)$`) })).toBeVisible();
});

test.describe("Quản trị", () => {
  test("Menu điện thoại → tìm 'lịch hẹn' → mở Lịch hẹn trao đổi và Ở LẠI trang đó", async ({ page }) => {
    requireCredentials("admin");
    await login(page, "admin");
    await page.getByRole("navigation", { name: "Menu quản trị" }).getByRole("button", { name: /Menu/ }).click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await menu.getByPlaceholder(/Tìm chức năng/).fill("lich hen"); // gõ không dấu vẫn tìm được
    await menu.getByRole("link", { name: /Lịch hẹn trao đổi/ }).click();

    await expect(page).toHaveURL(/\/admin\/consultations/);
    // Lỗi cũ: trang tự nhảy về Tổng quan sau khi đánh dấu thông báo đã đọc
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin\/consultations/);
    await expect(page.locator("main").getByRole("heading").first()).toBeVisible();
  });
});

/** Ô giờ còn trống đầu tiên → điền nội dung → gửi. Trả về nội dung (duy nhất) để tìm lại lịch hẹn. */
async function bookFirstSlot(page: Page) {
  const topic = `E2E kiểm thử đặt lịch ${Date.now()}`;
  await page.goto(withChild("/parent/booking"));
  const slots = page.getByRole("radiogroup", { name: "Chọn giờ hẹn" });
  await expect(slots, "Không có ô giờ trống — chạy lại supabase/seed/e2e.sql (khung giờ của giáo viên test)").toBeVisible();
  await slots.getByRole("radio", { disabled: false }).first().click();
  await page.locator("#topic").fill(topic);
  await page.getByRole("button", { name: /Gửi lịch hẹn/ }).click();
  await expect(page.getByText("Đã gửi lịch hẹn").first()).toBeVisible();
  return topic;
}

const bookingCard = (page: Page, topic: string) => page.locator("article").filter({ hasText: topic });

async function cancelAsParent(page: Page, topic: string) {
  await page.goto(withChild("/parent/booking"));
  const card = bookingCard(page, topic);
  if (!(await card.count())) return;
  await card.getByRole("button", { name: /Huỷ lịch/ }).click();
  const dialog = page.getByRole("dialog", { name: "Huỷ lịch hẹn" });
  await dialog.getByRole("button", { name: "Huỷ lịch hẹn" }).click();
  await expect(page.getByText("Đã huỷ lịch hẹn").first()).toBeVisible();
}

test("Đặt lịch hẹn: phụ huynh đặt → giáo viên xác nhận → phụ huynh thấy phòng họp → huỷ (dọn dữ liệu)", async ({ browser }) => {
  requireCredentials("parent", "teacher");
  requireWrites();
  test.setTimeout(150_000);

  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, "parent");
  const topic = await bookFirstSlot(parent);
  await expect(bookingCard(parent, topic)).toContainText(/Chờ/);

  const teacherCtx = await browser.newContext();
  try {
    const teacher = await teacherCtx.newPage();
    await login(teacher, "teacher");
    await teacher.goto("/teacher/availability");
    const card = bookingCard(teacher, topic);
    await expect(card, "Giáo viên không thấy lịch hẹn vừa đặt").toBeVisible();
    await card.getByRole("button", { name: /Xác nhận lịch hẹn/ }).click();
    await teacher.getByRole("dialog", { name: "Xác nhận lịch hẹn" }).getByRole("button", { name: "Xác nhận lịch hẹn" }).click();
    await expect(teacher.getByText("Đã xác nhận lịch hẹn").first()).toBeVisible();

    await parent.goto(withChild("/parent/booking"));
    await expect(bookingCard(parent, topic).getByRole("link", { name: /Vào phòng họp/ })).toBeVisible();
  } finally {
    await cancelAsParent(parent, topic);
    await teacherCtx.close();
    await parentCtx.close();
  }
});
