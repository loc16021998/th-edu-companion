import { z } from "zod";
import { CAMPUS_LABELS } from "@/config/constants";
import { normalizeVietnamesePhone } from "@/features/auth/schema";
import { isISODate } from "@/lib/date";
import { schoolDaySchema } from "@/lib/validation";
import type { Enums } from "@/types/database.types";

const CAMPUSES = Object.keys(CAMPUS_LABELS) as [Enums<"campus">, ...Enums<"campus">[]];
const campusSchema = z.enum(CAMPUSES, { errorMap: () => ({ message: "Vui lòng chọn cơ sở" }) });
const idSchema = (message: string) => z.string().uuid(message);
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid("Lựa chọn không hợp lệ").nullable());

// ----------------------------------------------------------------------------- Lớp học

export const createClassSchema = z.object({
  campus: campusSchema,
  name: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên lớp")
    .max(30, "Tên lớp tối đa 30 ký tự")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, "Tên lớp chỉ gồm chữ, số, dấu cách, . _ -"),
  teacherId: optionalId,
  shiftId: optionalId,
});

export const assignTeacherSchema = z.object({
  classId: idSchema("Lớp không hợp lệ"),
  teacherId: optionalId,
});

// ----------------------------------------------------------------------------- Tài khoản

const passwordSchema = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu quá dài");

/** Email và/hoặc SĐT (ít nhất một) — đều dùng được để đăng nhập. */
export const accountSchema = z
  .object({
    fullName: z.string().trim().min(2, "Vui lòng nhập họ tên").max(100, "Họ tên quá dài"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().email("Email không hợp lệ").nullable()),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const phone = normalizeVietnamesePhone(v);
        if (!phone) {
          ctx.addIssue({ code: "custom", message: "Số điện thoại không hợp lệ (vd: 0912 345 678)" });
          return z.NEVER;
        }
        return phone;
      }),
    password: passwordSchema,
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Nhập email hoặc số điện thoại để đăng nhập" });

export type AccountInput = z.infer<typeof accountSchema>;

export const MANAGED_ROLES = ["parent", "teacher"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

/** Admin tạo tài khoản: giáo viên bắt buộc chọn cơ sở, phụ huynh thì không. */
export const createAccountSchema = accountSchema
  .and(
    z.object({
      role: z.enum(MANAGED_ROLES, { errorMap: () => ({ message: "Vui lòng chọn loại tài khoản" }) }),
      campus: z
        .string()
        .optional()
        .transform((v) => v || null)
        .pipe(campusSchema.nullable()),
    }),
  )
  .superRefine((v, ctx) => {
    if (v.role === "teacher" && !v.campus) {
      ctx.addIssue({ code: "custom", path: ["campus"], message: "Vui lòng chọn cơ sở cho giáo viên" });
    }
  });

export const resetPasswordSchema = z.object({
  userId: idSchema("Tài khoản không hợp lệ"),
  password: passwordSchema,
});

// ----------------------------------------------------------------------------- Học sinh

/** Môn đăng ký: ít nhất 1 môn hợp lệ, bỏ trùng. */
export const studentSubjectsSchema = z
  .array(z.enum(["tien_tieu_hoc", "luyen_chu", "toan_tu_duy"], { errorMap: () => ({ message: "Môn học không hợp lệ" }) }))
  .min(1, "Chọn ít nhất một môn đăng ký")
  .transform((list) => [...new Set(list)]);

export const createStudentSchema = z
  .object({
    fullName: z.string().trim().min(2, "Vui lòng nhập họ tên học sinh").max(100, "Họ tên quá dài"),
    subjects: studentSubjectsSchema,
    dob: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isISODate(v), "Ngày sinh không hợp lệ"),
    classId: idSchema("Vui lòng chọn lớp"),
    parentMode: z.enum(["none", "existing", "new"]),
    parentId: z.string().optional(),
    parentFullName: z.string().optional(),
    parentEmail: z.string().optional(),
    parentPhone: z.string().optional(),
    parentPassword: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.parentMode === "existing" && !z.string().uuid().safeParse(v.parentId).success) {
      ctx.addIssue({ code: "custom", path: ["parentId"], message: "Vui lòng chọn phụ huynh" });
    }
  });

// ----------------------------------------------------------------------------- Học phí

export const createFeeSchema = z
  .object({
    target: z.enum(["student", "class"]),
    studentId: z.string().optional(),
    classId: z.string().optional(),
    title: z.string().trim().min(2, "Vui lòng nhập tên khoản thu").max(120, "Tên khoản thu quá dài"),
    amount: z.coerce
      .number({ invalid_type_error: "Số tiền không hợp lệ" })
      .int("Số tiền phải là số nguyên")
      .min(1_000, "Số tiền tối thiểu 1.000đ")
      .max(1_000_000_000, "Số tiền quá lớn"),
    dueDate: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isISODate(v), "Hạn đóng không hợp lệ"),
  })
  .superRefine((v, ctx) => {
    if (v.target === "student" && !z.string().uuid().safeParse(v.studentId).success) {
      ctx.addIssue({ code: "custom", path: ["studentId"], message: "Vui lòng chọn học sinh" });
    }
    if (v.target === "class" && !z.string().uuid().safeParse(v.classId).success) {
      ctx.addIssue({ code: "custom", path: ["classId"], message: "Vui lòng chọn lớp" });
    }
  });

export const recordPaymentSchema = z.object({
  feeId: idSchema("Khoản thu không hợp lệ"),
  paidAmount: z.coerce
    .number({ invalid_type_error: "Số tiền không hợp lệ" })
    .int("Số tiền phải là số nguyên")
    .min(0, "Số tiền không được âm"),
});

// ----------------------------------------------------------------------------- Chấm công giáo viên

export const TEACHER_ATTENDANCE_STATUSES = ["present", "late", "absent", "absent_with_permission"] as const;

export const saveTeacherAttendanceSchema = z.object({
  date: schoolDaySchema,
  records: z
    .array(
      z.object({
        teacherId: idSchema("Giáo viên không hợp lệ"),
        status: z.enum(TEACHER_ATTENDANCE_STATUSES),
        note: z.string().trim().max(200, "Ghi chú tối đa 200 ký tự"),
      }),
    )
    .min(1, "Chưa có giáo viên nào")
    .max(200),
});

export type SaveTeacherAttendanceInput = z.infer<typeof saveTeacherAttendanceSchema>;
