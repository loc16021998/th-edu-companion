import { createAccountSchema, createAdminSchema, removeAdminSchema } from "@/features/admin/schema";

const base = { fullName: "Nguyễn Quản Trị", email: "qt.moi@th-edu.vn", phone: "", currentPassword: "matkhaucuatoi" };

describe("Tạo tài khoản quản trị", () => {
  test("mật khẩu mạnh + có mật khẩu xác nhận → hợp lệ", () => {
    expect(createAdminSchema.safeParse({ ...base, password: "QuanTri2026xyz" }).success).toBe(true);
  });
  test.each([
    ["ngắn hơn 10 ký tự", "Abc12345"],
    ["chỉ có chữ", "QuanTriTrungTam"],
    ["chỉ có số", "12345678901"],
  ])("mật khẩu %s → bị từ chối", (_, password) => {
    expect(createAdminSchema.safeParse({ ...base, password }).success).toBe(false);
  });
  test("thiếu mật khẩu xác nhận của người tạo → bị từ chối", () => {
    expect(createAdminSchema.safeParse({ ...base, currentPassword: "", password: "QuanTri2026xyz" }).success).toBe(false);
  });
  test("phải có email hoặc SĐT để đăng nhập", () => {
    expect(createAdminSchema.safeParse({ ...base, email: "", password: "QuanTri2026xyz" }).success).toBe(false);
  });
});

test("form cấp tài khoản phụ huynh / giáo viên KHÔNG tạo được quản trị viên", () => {
  expect(createAccountSchema.safeParse({ ...base, password: "QuanTri2026xyz", role: "admin", campus: "" }).success).toBe(false);
});

test("thu hồi quản trị viên cần mã tài khoản hợp lệ + mật khẩu xác nhận", () => {
  expect(removeAdminSchema.safeParse({ userId: "not-a-uuid", currentPassword: "x" }).success).toBe(false);
  expect(removeAdminSchema.safeParse({ userId: "11111111-1111-4111-8111-111111111111", currentPassword: "" }).success).toBe(false);
  expect(removeAdminSchema.safeParse({ userId: "11111111-1111-4111-8111-111111111111", currentPassword: "x" }).success).toBe(true);
});
