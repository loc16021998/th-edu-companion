import { expect, test, type Page } from "@playwright/test";
import { login, requireCredentials } from "./helpers";

/**
 * Giáo viên điểm danh 1 học sinh → phụ huynh của bé thấy đúng trạng thái.
 * GHI DỮ LIỆU: đổi trạng thái của E2E_STUDENT_NAME ở ngày học gần nhất rồi KHÔI PHỤC trạng thái cũ (kể cả khi test lỗi).
 * Chỉ chạy khi E2E_ALLOW_WRITES=1 — nên dùng project Supabase thử nghiệm (xem tests/README.md).
 */
const STUDENT = process.env.E2E_STUDENT_NAME;
const CLASS_KEY = process.env.E2E_CLASS_KEY; // vd. "CS1_XALA:K1A" khi giáo viên có nhiều lớp
const CHILD_ID = process.env.E2E_CHILD_ID; // khi phụ huynh có nhiều con

/** Nhãn nút của giáo viên → nhãn hiển thị cho phụ huynh. */
const PARENT_LABEL: Record<string, string> = { "Có mặt": "Có mặt", "Đi muộn": "Đi muộn", Vắng: "Nghỉ học", "Có phép": "Nghỉ có phép" };
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

async function openAttendance(page: Page) {
  await page.goto(`/teacher/attendance${CLASS_KEY ? `?${new URLSearchParams({ class: CLASS_KEY })}` : ""}`);
  const group = page.getByRole("radiogroup", { name: `Điểm danh ${STUDENT}` });
  await expect(group, `Không thấy học sinh "${STUDENT}" trong lớp — kiểm tra E2E_STUDENT_NAME / E2E_CLASS_KEY`).toBeVisible();
  return group;
}

async function setStatus(page: Page, label: string) {
  const group = await openAttendance(page);
  await group.getByRole("radio", { name: label, exact: true }).click();
  await expect(group.getByRole("radio", { name: label, exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Lưu điểm danh/ }).click();
  await expect(page.getByText(/Đã lưu điểm danh/).first()).toBeVisible();
}

test("giáo viên điểm danh → phụ huynh thấy đúng trạng thái", async ({ browser }) => {
  requireCredentials("teacher", "parent");
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Kịch bản ghi dữ liệu — đặt E2E_ALLOW_WRITES=1 (nên dùng Supabase thử nghiệm)");
  test.skip(!STUDENT, "Thiếu E2E_STUDENT_NAME (học sinh thuộc lớp của giáo viên test và là con của phụ huynh test)");
  test.setTimeout(120_000);

  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await login(teacher, "teacher");

  // 1. Trạng thái hiện tại → chọn trạng thái khác (Có mặt ↔ Đi muộn) để chắc chắn có thay đổi
  const group = await openAttendance(teacher);
  const date = await teacher.locator("#date-input").inputValue();
  const original = ((await group.getByRole("radio", { checked: true }).textContent()) ?? "").trim();
  const target = original === "Đi muộn" ? "Có mặt" : "Đi muộn";

  try {
    // 2. Giáo viên đổi trạng thái + lưu
    await setStatus(teacher, target);

    // 3. Phụ huynh xem tuần có ngày vừa điểm danh
    const parentCtx = await browser.newContext();
    const parent = await parentCtx.newPage();
    await login(parent, "parent");
    const q = new URLSearchParams({ view: "week", date, ...(CHILD_ID && { child: CHILD_ID }) });
    await parent.goto(`/parent/attendance?${q}`);
    const weekday = WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
    const day = parent
      .getByRole("listitem")
      .filter({ has: parent.getByText(weekday, { exact: true }) })
      .filter({ has: parent.getByText(date.slice(8), { exact: true }) });
    await expect(day).toContainText(PARENT_LABEL[target]!);
    await parentCtx.close();
  } finally {
    // 4. Khôi phục trạng thái ban đầu (dữ liệu thật của bé không bị đổi sau khi test)
    if (original && original !== target && PARENT_LABEL[original]) await setStatus(teacher, original);
    await teacherCtx.close();
  }
});
