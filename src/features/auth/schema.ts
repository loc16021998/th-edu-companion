import { z } from "zod";

export type LoginIdentifier = { type: "email"; email: string } | { type: "phone"; phone: string };

/**
 * Chuẩn hoá số di động Việt Nam về E.164 (định dạng Supabase Auth dùng).
 * Chấp nhận: "0912 345 678", "0912.345.678", "84912345678", "+84 912 345 678".
 */
export function normalizeVietnamesePhone(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, "");
  let national: string;
  if (/^\+84\d+$/.test(compact)) national = compact.slice(3);
  else if (/^84\d{9}$/.test(compact)) national = compact.slice(2);
  else if (/^0\d+$/.test(compact)) national = compact.slice(1);
  else return null;

  return /^[35789]\d{8}$/.test(national) ? `+84${national}` : null;
}

export function parseLoginIdentifier(raw: string): LoginIdentifier | null {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return z.string().email().safeParse(email).success ? { type: "email", email } : null;
  }
  const phone = normalizeVietnamesePhone(value);
  return phone ? { type: "phone", phone } : null;
}

/** Mục đăng nhập: phụ huynh, giáo viên (trang /login) hoặc quản trị (trang /admin/login riêng). */
export const LOGIN_PORTALS = ["parent", "staff", "admin"] as const;
export type LoginPortal = (typeof LOGIN_PORTALS)[number];

export const loginSchema = z.object({
  portal: z.enum(LOGIN_PORTALS).catch("parent"),
  identifier: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email hoặc số điện thoại")
    .transform((value, ctx) => {
      const identifier = parseLoginIdentifier(value);
      if (!identifier) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: value.includes("@")
            ? "Email không hợp lệ"
            : "Số điện thoại không hợp lệ (ví dụ: 0912 345 678)",
        });
        return z.NEVER;
      }
      return identifier;
    }),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(72, "Mật khẩu quá dài"),
  next: z.string().optional(),
});

/** Người dùng tự đổi mật khẩu khi đã đăng nhập (mọi vai trò). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại").max(72, "Mật khẩu quá dài"),
    newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự").max(72, "Mật khẩu mới quá dài"),
    confirmPassword: z.string(),
    signOutOthers: z
      .string()
      .optional()
      .transform((v) => v === "on"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Mật khẩu nhập lại không khớp" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Mật khẩu mới phải khác mật khẩu hiện tại" });
