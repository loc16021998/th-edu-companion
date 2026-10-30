import { z } from "zod";
import { CAMPUS_LABELS } from "@/config/constants";
import { normalizeVietnamesePhone } from "@/features/auth/schema";
import { studentSubjectsSchema } from "@/features/admin/schema";
import { isISODate } from "@/lib/date";
import type { Enums } from "@/types/database.types";
import { LEAD_NOTES_MAX, LEAD_SOURCES, LEAD_STATUSES, PROGRAM_KEYS, TRIAL_TEXT_MAX, type LeadSource } from "./constants";

const CAMPUSES = Object.keys(CAMPUS_LABELS) as [Enums<"campus">, ...Enums<"campus">[]];
const SOURCES = Object.keys(LEAD_SOURCES) as [LeadSource, ...LeadSource[]];
const PROGRAMS = PROGRAM_KEYS as [string, ...string[]];

const optionalDate = (message: string) =>
  z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || isISODate(v), message);
const optionalId = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.string().uuid("Lựa chọn không hợp lệ").nullable());
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .optional()
    .transform((v) => v || null);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập số điện thoại phụ huynh")
  .transform((v, ctx) => {
    const phone = normalizeVietnamesePhone(v);
    if (!phone) {
      ctx.addIssue({
        code: "custom",
        message: "Số điện thoại không hợp lệ (vd: 0912 345 678)",
      });
      return z.NEVER;
    }
    return phone;
  });

// ----------------------------------------------------------------------------- Lead

export const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên bé").max(100, "Họ tên quá dài"),
  dob: optionalDate("Ngày sinh không hợp lệ"),
  parentName: z.string().trim().min(2, "Vui lòng nhập tên phụ huynh").max(100, "Tên quá dài"),
  phone: phoneSchema,
  targetProgram: z.enum(PROGRAMS, {
    errorMap: () => ({ message: "Vui lòng chọn chương trình" }),
  }),
  campus: z.enum(CAMPUSES, {
    errorMap: () => ({ message: "Vui lòng chọn cơ sở" }),
  }),
  source: z.enum(SOURCES, { errorMap: () => ({ message: "Nguồn không hợp lệ" }) }).default("khac"),
  notes: optionalText(LEAD_NOTES_MAX, "Ghi chú"),
  followUpOn: optionalDate("Ngày hẹn gọi lại không hợp lệ"),
  assignedTo: optionalId,
});
export type LeadInput = z.infer<typeof leadSchema>;

export const leadStatusSchema = z
  .object({
    id: z.string().uuid("Học sinh tiềm năng không hợp lệ"),
    status: z.enum(LEAD_STATUSES, {
      errorMap: () => ({ message: "Trạng thái không hợp lệ" }),
    }),
    lostReason: optionalText(300, "Lý do"),
  })
  .refine((v) => v.status !== "enrolled", {
    path: ["status"],
    message: "Dùng nút “Chuyển thành học viên chính thức” để nhập học",
  });

// ----------------------------------------------------------------------------- Lịch học thử

/** Ô datetime-local (giờ Việt Nam, "2026-11-02T14:30") → ISO có múi giờ +07:00. */
const vnDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Vui lòng chọn ngày giờ học thử")
  .transform((v) => new Date(`${v}:00+07:00`).toISOString());

export const trialSchema = z.object({
  leadId: z.string().uuid("Học sinh tiềm năng không hợp lệ"),
  scheduledAt: vnDateTime,
  durationMinutes: z.coerce.number().int().min(15, "Tối thiểu 15 phút").max(240, "Tối đa 240 phút").default(60),
  campus: z.enum(CAMPUSES, {
    errorMap: () => ({ message: "Vui lòng chọn cơ sở" }),
  }),
  program: z.enum(PROGRAMS, {
    errorMap: () => ({ message: "Vui lòng chọn chương trình" }),
  }),
  classId: optionalId,
  teacherId: optionalId,
  noteForTeacher: optionalText(TRIAL_TEXT_MAX, "Ghi chú cho giáo viên"),
  /** "on" = gửi tin xác nhận Zalo/SMS ngay khi lưu */
  sendConfirmation: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const rescheduleSchema = trialSchema.omit({ leadId: true, sendConfirmation: true }).extend({
  id: z.string().uuid("Buổi học thử không hợp lệ"),
});

export const trialStatusSchema = z.object({
  id: z.string().uuid("Buổi học thử không hợp lệ"),
  status: z.enum(["scheduled", "no_show", "cancelled"]),
});

export const assessmentSchema = z
  .object({
    trialId: z.string().uuid("Buổi học thử không hợp lệ"),
    attended: z.boolean(),
    level: z.number().int().min(1).max(4).nullable(),
    skills: z.record(z.string().max(40), z.number().int().min(1, "Điểm 1–5").max(5, "Điểm 1–5")).default({}),
    strengths: optionalText(TRIAL_TEXT_MAX, "Điểm mạnh"),
    improvements: optionalText(TRIAL_TEXT_MAX, "Cần cải thiện"),
    recommendation: optionalText(TRIAL_TEXT_MAX, "Đề xuất"),
  })
  .refine((v) => !v.attended || v.level !== null, {
    path: ["level"],
    message: "Vui lòng chọn mức năng lực của bé",
  });
export type AssessmentInput = z.input<typeof assessmentSchema>;

// ----------------------------------------------------------------------------- Chuyển thành học viên

const passwordSchema = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu quá dài");

export const convertLeadSchema = z
  .object({
    leadId: z.string().uuid("Học sinh tiềm năng không hợp lệ"),
    fullName: z.string().trim().min(2, "Vui lòng nhập họ tên học sinh").max(100, "Họ tên quá dài"),
    dob: optionalDate("Ngày sinh không hợp lệ"),
    classId: z.string().uuid("Vui lòng chọn lớp"),
    subjects: studentSubjectsSchema,
    parentMode: z.enum(["existing", "new"]),
    parentId: optionalId,
    parentFullName: z.string().trim().max(100, "Tên quá dài").optional().default(""),
    parentPhone: z.string().trim().optional().default(""),
    parentEmail: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().email("Email không hợp lệ").nullable()),
    parentPassword: z.string().optional().default(""),
    feeTitle: z.string().trim().min(2, "Vui lòng nhập tên khoản học phí").max(120, "Tên khoản tối đa 120 ký tự"),
    feeAmount: z.coerce
      .number({ invalid_type_error: "Số tiền không hợp lệ" })
      .int("Số tiền phải là số nguyên")
      .min(0, "Số tiền không hợp lệ")
      .max(1_000_000_000, "Số tiền quá lớn"),
    feeDueDate: optionalDate("Hạn đóng không hợp lệ"),
  })
  .superRefine((v, ctx) => {
    if (v.parentMode === "existing" && !v.parentId) {
      ctx.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "Vui lòng chọn tài khoản phụ huynh",
      });
    }
    if (v.parentMode === "new") {
      if (v.parentFullName.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["parentFullName"],
          message: "Vui lòng nhập họ tên phụ huynh",
        });
      if (!normalizeVietnamesePhone(v.parentPhone)) {
        ctx.addIssue({
          code: "custom",
          path: ["parentPhone"],
          message: "Số điện thoại không hợp lệ (vd: 0912 345 678)",
        });
      }
      const pw = passwordSchema.safeParse(v.parentPassword);
      if (!pw.success)
        ctx.addIssue({
          code: "custom",
          path: ["parentPassword"],
          message: pw.error.issues[0]?.message ?? "Mật khẩu không hợp lệ",
        });
    }
  });
