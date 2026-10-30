import { z } from "zod";
import { isISODate } from "@/lib/date";
import { accountSchema } from "@/features/admin/schema";
import { normalizeVietnamesePhone } from "@/features/auth/schema";
import { ANNOUNCEMENT_CATEGORY_KEYS, AUDIENCES, CAMPUS_LIST, type AnnouncementCategory, type Campus } from "./constants";

const campusSchema = z.enum(CAMPUS_LIST as [Campus, ...Campus[]], { errorMap: () => ({ message: "Vui lòng chọn cơ sở" }) });
const uuid = (message: string) => z.string().uuid(message);
const monthSchema = z.string().refine((v) => isISODate(v) && v.endsWith("-01"), "Tháng không hợp lệ");

// ----------------------------------------------------------------------------- Giáo viên

const teacherScopeSchema = z.object({
  campus: campusSchema,
  /** Cơ sở giáo viên được xem TOÀN BỘ lớp */
  campusWide: z.array(campusSchema).max(CAMPUS_LIST.length).default([]),
  classIds: z.array(uuid("Lớp không hợp lệ")).max(100).default([]),
});

export const createTeacherSchema = accountSchema.and(teacherScopeSchema);

export const updateTeacherSchema = teacherScopeSchema.extend({
  teacherId: uuid("Giáo viên không hợp lệ"),
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên").max(100, "Họ tên quá dài"),
  /** SĐT / email đăng nhập MỚI — bỏ trống = giữ nguyên */
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const phone = normalizeVietnamesePhone(v);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Số điện thoại không hợp lệ (vd: 0912 345 678)" });
        return z.NEVER;
      }
      return phone;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().email("Email không hợp lệ").optional()),
});
export type UpdateTeacherInput = z.input<typeof updateTeacherSchema>;

// ----------------------------------------------------------------------------- Học sinh

export const updateStudentSchema = z.object({
  studentId: uuid("Học sinh không hợp lệ"),
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên học sinh").max(100, "Họ tên quá dài"),
  dob: z
    .string()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || isISODate(v), "Ngày sinh không hợp lệ"),
  classId: uuid("Vui lòng chọn lớp"),
  /** SĐT tài khoản phụ huynh; rỗng = bỏ liên kết */
  parentPhone: z.string().trim().max(20),
});
export type UpdateStudentInput = z.input<typeof updateStudentSchema>;

// ----------------------------------------------------------------------------- Tạo học phí tháng

export const generateFeesSchema = z.object({
  month: monthSchema,
  title: z.string().trim().min(2, "Vui lòng nhập tên khoản thu").max(120, "Tên khoản thu quá dài"),
  dueDate: z
    .string()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || isISODate(v), "Hạn đóng không hợp lệ"),
  items: z
    .array(
      z.object({
        classId: uuid("Lớp không hợp lệ"),
        amount: z.number().int("Số tiền phải là số nguyên").min(1_000, "Học phí tối thiểu 1.000đ").max(1_000_000_000, "Số tiền quá lớn"),
      }),
    )
    .min(1, "Chọn ít nhất một lớp")
    .max(300),
  saveDefaults: z.boolean(),
  /** Trừ học phí các buổi nghỉ có phép THÁNG TRƯỚC. perSession null = tự tính theo học phí lớp / số buổi học */
  deductExcused: z
    .object({ perSession: z.number().int().min(0).max(10_000_000).nullable() })
    .nullable()
    .default(null),
});
export type GenerateFeesInput = z.input<typeof generateFeesSchema>;

// ----------------------------------------------------------------------------- Thông báo chung

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự").max(150, "Tiêu đề tối đa 150 ký tự"),
    body: z.string().trim().min(1, "Vui lòng nhập nội dung").max(5000, "Nội dung tối đa 5000 ký tự"),
    category: z.enum(ANNOUNCEMENT_CATEGORY_KEYS as [AnnouncementCategory, ...AnnouncementCategory[]]),
    audience: z.enum(AUDIENCES),
    classIds: z.array(uuid("Lớp không hợp lệ")).max(200).default([]),
  })
  .refine((v) => v.audience !== "classes" || v.classIds.length > 0, { path: ["classIds"], message: "Chọn ít nhất một lớp nhận thông báo" });
