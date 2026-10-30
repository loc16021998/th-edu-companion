import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/types/database.types";
import type { AccountInput } from "./schema";

export class AccountError extends Error {}

const WRONG_KEY_MESSAGE =
  "SUPABASE_SERVICE_ROLE_KEY không đúng — có thể đã dán nhầm khoá anon/publishable. Hãy lấy khoá service_role (Secret key) trong Supabase → Project Settings → API Keys, rồi khởi động lại server.";

/** Khoá sai / không đủ quyền quản trị → báo đúng nguyên nhân thay vì lỗi chung chung. */
function isWrongKeyError(error: { status?: number; message?: string; code?: string }): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.code === "not_admin" ||
    /invalid api key|not_admin|user not allowed|jwt|unauthorized/i.test(error.message ?? "")
  );
}

/**
 * Tạo tài khoản đăng nhập (Supabase Auth) cho phụ huynh / giáo viên.
 * Cần SUPABASE_SERVICE_ROLE_KEY (chỉ ở server). Profile được trigger handle_new_user tạo,
 * sau đó gán vai trò/cơ sở bằng service role (trigger chống tự nâng quyền cho phép vì không có auth.uid()).
 * Gọi SAU requireRole("admin").
 */
export async function createUserAccount(
  input: AccountInput,
  role: Enums<"roles">,
  campus: Enums<"campus"> | null,
): Promise<string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AccountError("Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server nên chưa tạo được tài khoản mới.");
  }
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email ?? undefined,
    phone: input.phone ?? undefined,
    password: input.password,
    email_confirm: Boolean(input.email),
    phone_confirm: Boolean(input.phone),
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message)) {
      throw new AccountError("Email hoặc số điện thoại này đã có tài khoản.");
    }
    if (error && isWrongKeyError(error)) throw new AccountError(WRONG_KEY_MESSAGE);
    console.error("[admin] createUser thất bại:", error);
    throw new AccountError("Không tạo được tài khoản. Vui lòng thử lại.");
  }

  const userId = data.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: input.fullName, role, campus })
    .eq("id", userId);
  if (profileError) {
    console.error("[admin] cập nhật profile thất bại:", profileError);
    await admin.auth.admin.deleteUser(userId); // không để lại tài khoản sai vai trò
    throw new AccountError("Không gán được vai trò cho tài khoản. Vui lòng thử lại.");
  }
  return userId;
}

function requireServiceRole() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AccountError("Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server nên chưa quản lý được tài khoản.");
  }
  return createAdminClient();
}

/** Chỉ cho thao tác trên tài khoản phụ huynh / giáo viên — không đụng tới tài khoản quản trị. */
async function assertManageable(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile) throw new AccountError("Không tìm thấy tài khoản.");
  if (profile.role === "admin") throw new AccountError("Không thể thao tác trên tài khoản quản trị tại đây.");
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  const admin = requireServiceRole();
  await assertManageable(admin, userId);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error("[admin] đặt lại mật khẩu thất bại:", error);
    if (isWrongKeyError(error)) throw new AccountError(WRONG_KEY_MESSAGE);
    throw new AccountError("Không đặt lại được mật khẩu. Vui lòng thử lại.");
  }
}

/**
 * Đổi SĐT / email ĐĂNG NHẬP (Supabase Auth) + đồng bộ profiles.phone. Chỉ truyền trường cần đổi.
 * Không xoá được SĐT/email đang dùng (chỉ đổi sang giá trị mới) để tài khoản luôn còn cách đăng nhập.
 */
export async function updateUserLogin(userId: string, changes: { phone?: string; email?: string }): Promise<void> {
  if (!changes.phone && !changes.email) return;
  const admin = requireServiceRole();
  await assertManageable(admin, userId);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ...(changes.phone && { phone: changes.phone, phone_confirm: true }),
    ...(changes.email && { email: changes.email, email_confirm: true }),
  });
  if (error) {
    console.error("[admin] đổi thông tin đăng nhập thất bại:", error);
    if (isWrongKeyError(error)) throw new AccountError(WRONG_KEY_MESSAGE);
    if (/already|exists|registered|unique/i.test(error.message)) throw new AccountError("SĐT hoặc email này đã thuộc một tài khoản khác.");
    throw new AccountError("Không đổi được thông tin đăng nhập. Vui lòng thử lại.");
  }
  if (changes.phone) {
    const { error: profileError } = await admin.from("profiles").update({ phone: changes.phone }).eq("id", userId);
    if (profileError) console.error("[admin] đồng bộ SĐT hồ sơ thất bại:", profileError);
  }
}

/** Xoá đăng nhập + hồ sơ (cascade). Học sinh của phụ huynh được giữ lại, chỉ bỏ liên kết. */
export async function deleteUserAccount(userId: string): Promise<void> {
  const admin = requireServiceRole();
  await assertManageable(admin, userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[admin] xoá tài khoản thất bại:", error);
    if (isWrongKeyError(error)) throw new AccountError(WRONG_KEY_MESSAGE);
    throw new AccountError("Không xoá được tài khoản. Vui lòng thử lại.");
  }
}

/** Email đăng nhập theo user id (bảng profiles không lưu email). Không có service role → map rỗng. */
export async function getLoginEmails(): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return emails;
  try {
    const admin = createAdminClient();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) if (u.email) emails.set(u.id, u.email);
      if (data.users.length < 1000) break;
    }
  } catch (err) {
    console.error("[admin] Không tải được email đăng nhập:", err);
  }
  return emails;
}
