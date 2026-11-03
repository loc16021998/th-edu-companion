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

test("Sổ liên lạc: đánh giá nhanh → gợi ý nhận xét → dùng câu này / hoàn tác / câu mẫu / áp dụng cả lớp", async ({ page }) => {
  requireCredentials("teacher");
  test.skip(!CHILD_ID || !process.env.E2E_CLASS_KEY, "Thiếu E2E_CHILD_ID / E2E_CLASS_KEY");
  await login(page, "teacher");
  await page.goto(`/teacher/daily-report?${new URLSearchParams({ class: process.env.E2E_CLASS_KEY!, student: CHILD_ID! })}`);

  const note = page.locator('textarea[name="teacherNote"]');
  await note.fill("");
  const ai = page.getByRole("button", { name: /Dùng AI gợi ý nhận xét/ });
  await expect(ai).toBeDisabled(); // chưa chọn đánh giá nào

  await page.getByRole("button", { name: /Hào hứng/ }).click();
  await page.getByRole("button", { name: "Tập trung cao" }).click();
  await page.getByRole("button", { name: "Cầm bút chưa đúng" }).click();
  await expect(page.getByRole("button", { name: "Tập trung cao" })).toHaveAttribute("aria-pressed", "true");
  await ai.click();

  // AI (hoặc mẫu dự phòng khi chưa cấu hình AI) trả về ít nhất 2 phương án
  const use = page.getByRole("button", { name: "Dùng câu này" });
  await expect(use.first()).toBeVisible({ timeout: 60_000 });
  expect(await use.count()).toBeGreaterThanOrEqual(2);

  await use.first().click();
  await expect(note).not.toHaveValue("");
  const chosen = await note.inputValue();
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(note).toHaveValue("");
  await use.first().click();
  await expect(note).toHaveValue(chosen);

  // Lưu làm câu mẫu → chèn lại được (lưu trên máy)
  await page.getByRole("button", { name: "Lưu làm câu mẫu" }).first().click();
  await note.fill("");
  await page.getByTitle("Chạm để dùng câu này").first().click();
  await expect(note).toHaveValue(chosen);

  // Áp dụng cả lớp với câu có tên bé → cảnh báo + đổi thành "con"
  const applyAll = page.getByRole("checkbox", { name: /Áp dụng nhận xét chung cho cả lớp/ });
  if (await applyAll.isVisible()) {
    await note.fill("Hôm nay bé An rất hào hứng.");
    await applyAll.check();
    await page.getByRole("button", { name: 'Đổi thành "con"' }).click();
    await expect(note).toHaveValue("Hôm nay con rất hào hứng.");
    await applyAll.uncheck();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Không bấm Lưu — kịch bản không ghi dữ liệu
});

test("Quản trị Trợ lý nhận xét: câu mẫu chung → giáo viên thấy; tắt AI / tắt trợ lý có hiệu lực; thống kê", async ({ browser }) => {
  requireCredentials("admin", "teacher");
  requireWrites();
  test.skip(!CHILD_ID || !process.env.E2E_CLASS_KEY, "Thiếu E2E_CHILD_ID / E2E_CLASS_KEY");
  test.setTimeout(180_000);
  const marker = `E2E câu mẫu ${Date.now()}`;
  const reportUrl = `/teacher/daily-report?${new URLSearchParams({ class: process.env.E2E_CLASS_KEY!, student: CHILD_ID! })}`;

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, "admin");
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await login(teacher, "teacher");

  const settingSwitch = (name: RegExp) => admin.getByRole("switch", { name });
  async function setSwitch(name: RegExp, on: boolean) {
    const sw = settingSwitch(name);
    if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  }
  async function saveSettings() {
    await admin.getByRole("button", { name: "Lưu cài đặt" }).click();
    await expect(admin.getByText("Đã lưu cài đặt Trợ lý").first()).toBeVisible();
  }

  try {
    // Vào từ trang Sổ liên lạc của quản trị
    await admin.goto("/admin/daily-report");
    await admin.getByRole("link", { name: /Quản lý Trợ lý viết nhận xét/ }).click();
    await expect(admin).toHaveURL(/\/admin\/daily-report\/ai/);

    // 1. Câu mẫu chung có {tên} → giáo viên thấy, đã điền tên bé
    await admin.getByPlaceholder(/VD: Hôm nay bé \{tên\}/).fill(`${marker}: bé `);
    await admin.getByRole("button", { name: "Chèn {tên}" }).click();
    await admin.getByPlaceholder(/VD: Hôm nay bé \{tên\}/).press("End");
    await admin.getByPlaceholder(/VD: Hôm nay bé \{tên\}/).pressSequentially(" rất ngoan.");
    await admin.getByRole("button", { name: "Thêm câu mẫu" }).click();
    await expect(admin.getByText("Đã thêm câu mẫu").first()).toBeVisible();
    await expect(admin.getByText(`${marker}: bé {tên} rất ngoan.`)).toBeVisible();

    await teacher.goto(reportUrl);
    const centerTemplate = teacher.getByTitle("Chạm để dùng câu mẫu của trung tâm").filter({ hasText: marker });
    await expect(centerTemplate).toHaveText(`${marker}: bé An rất ngoan.`);
    await centerTemplate.click();
    await expect(teacher.locator('textarea[name="teacherNote"]')).toHaveValue(`${marker}: bé An rất ngoan.`);

    // 2. Ẩn câu mẫu → giáo viên không còn thấy
    await admin.locator("li").filter({ hasText: marker }).getByRole("button", { name: "Ẩn" }).click();
    await expect(admin.getByText("Đã ẩn câu mẫu").first()).toBeVisible();
    await teacher.reload();
    await expect(teacher.getByTitle("Chạm để dùng câu mẫu của trung tâm").filter({ hasText: marker })).toHaveCount(0);

    // 3. Tắt AI → nút của giáo viên thành "theo mẫu", gợi ý vẫn chạy
    await setSwitch(/Dùng AI viết gợi ý/, false);
    await saveSettings();
    await teacher.reload();
    await teacher.getByRole("button", { name: "Tập trung cao" }).click();
    await teacher.getByRole("button", { name: /Gợi ý nhận xét theo mẫu/ }).click();
    await expect(teacher.getByText(/Trung tâm đang dùng gợi ý theo mẫu/)).toBeVisible({ timeout: 30_000 });

    // 4. Tắt trợ lý → giáo viên không còn thấy khung trợ lý
    await setSwitch(/Hiện Trợ lý viết nhận xét/, false);
    await saveSettings();
    await teacher.reload();
    await expect(teacher.locator('textarea[name="teacherNote"]')).toBeVisible();
    await expect(teacher.getByText("Trợ lý viết nhận xét")).toHaveCount(0);

    // 5. Thống kê có lượt vừa dùng
    await admin.reload();
    await expect(admin.getByRole("table", { name: "Lượt dùng theo người" })).toContainText("Lê Thị Hương");
  } finally {
    // Khôi phục cài đặt + xoá câu mẫu test
    await admin.goto("/admin/daily-report/ai");
    await setSwitch(/Hiện Trợ lý viết nhận xét/, true);
    await setSwitch(/Dùng AI viết gợi ý/, true);
    if (await admin.getByRole("button", { name: "Lưu cài đặt" }).isEnabled()) await saveSettings();
    const row = admin.locator("li").filter({ hasText: marker });
    if (await row.count()) {
      await row.getByRole("button", { name: "Xoá" }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
      await expect(admin.getByText("Đã xoá câu mẫu").first()).toBeVisible();
    }
    await teacherCtx.close();
    await adminCtx.close();
  }
});

test("Trợ lý AI phụ huynh: trả lời theo kho kiến thức của trung tâm + kết nối Quản lý cơ sở", async ({ browser }) => {
  requireCredentials("admin", "parent");
  requireWrites();
  test.setTimeout(180_000);
  const marker = `E2E${Date.now()}`;
  const title = `Nghỉ học và học bù ${marker}`;

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, "admin");
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, "parent");

  try {
    // 1. Quản trị soạn quy chế học bù (đang bật)
    await admin.goto("/admin/ai-knowledge");
    await admin.getByRole("button", { name: "Thêm bài viết" }).click();
    const sheet = admin.getByRole("dialog", { name: "Thêm bài viết" });
    await sheet.getByLabel("Tiêu đề").fill(title);
    await sheet.getByLabel("Nội dung").fill(`- Bé nghỉ có phép được học bù trong vòng 2 tuần (mã kiểm thử ${marker}).`);
    await sheet.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(admin.getByText("Đã thêm bài viết").first()).toBeVisible();
    await expect(admin.getByRole("heading", { name: title })).toBeVisible();

    // 2. Phụ huynh hỏi qua câu gợi ý → trả lời theo đúng tài liệu
    await parent.goto("/parent/ai-assistant");
    const chat = parent.getByRole("region", { name: "Trợ lý AI hỏi – đáp" });
    await expect(chat).toBeVisible();
    // Không trùng nút chat nổi; nút Gửi không bị nút nổi / thanh tab che
    await expect(parent.getByRole("button", { name: "Chat với tư vấn viên" })).toHaveCount(0);
    await expect(parent.getByRole("link", { name: "Chat Zalo với trung tâm" })).toHaveCount(0);
    const navTop = (await parent.getByRole("navigation", { name: "Điều hướng phụ huynh" }).boundingBox())!.y;
    const sendBox = (await chat.getByRole("button", { name: "Gửi" }).boundingBox())!;
    const hintBox = (await chat.getByText(/Câu trả lời tự động có thể chưa chính xác/).boundingBox())!;
    expect(sendBox.y + sendBox.height, "Nút Gửi bị thanh tab che").toBeLessThanOrEqual(navTop);
    expect(hintBox.y + hintBox.height, "Dòng ghi chú bị thanh tab che").toBeLessThanOrEqual(navTop);
    const reset = chat.getByRole("button", { name: "Cuộc trò chuyện mới" });
    if (await reset.isVisible()) await reset.click();
    await chat.getByRole("button", { name: "Bé nghỉ học có được học bù không?" }).click();
    await expect(chat.getByText(/học bù trong vòng 2 tuần/).first()).toBeVisible({ timeout: 60_000 });

    // 3. Câu khiếu nại → nút kết nối Quản lý cơ sở → gửi
    const question = `Tôi muốn khiếu nại vì học phí bị thu sai (${marker})`;
    await chat.getByLabel("Câu hỏi cho tư vấn viên").fill(question);
    await chat.getByRole("button", { name: "Gửi" }).click();
    const connect = chat.getByRole("button", { name: "Kết nối Quản lý cơ sở" }).last();
    await expect(connect).toBeVisible({ timeout: 60_000 });
    await expect(chat.getByText("[KET_NOI_QUAN_LY]")).toHaveCount(0);
    await connect.click();
    await expect(chat.getByText("Đã chuyển tới Quản lý cơ sở").first()).toBeVisible();

    // 4. Quản trị nhận yêu cầu ở Lắng nghe phụ huynh
    await admin.goto("/admin/feedback");
    await expect(admin.getByText(new RegExp(`Từ Trợ lý AI[\\s\\S]*${marker}`)).first()).toBeVisible();
  } finally {
    await admin.goto("/admin/ai-knowledge");
    const row = admin.locator("li").filter({ hasText: marker });
    if (await row.count()) {
      await row.getByRole("button", { name: "Xoá" }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Xoá" }).click();
      await expect(admin.getByText("Đã xoá bài viết").first()).toBeVisible();
    }
    await parentCtx.close();
    await adminCtx.close();
  }
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
