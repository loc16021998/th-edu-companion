import { z } from "zod";
import { schoolDaySchema, uuidSchema } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Dữ liệu đã lưu (cột JSONB daily_reports.subjects_summary) — dùng khi ĐỌC
// ---------------------------------------------------------------------------
const storedSubjectEntry = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).default(""),
  /** Điểm từng tiêu chí (SUBJECT_CRITERIA), 1–5. Bản ghi cũ không có → {} */
  criteria: z.record(z.string(), z.number().int().min(1).max(5)).catch({}).default({}),
});

/** Key khớp SUBJECTS trong config/constants. Key lạ bị bỏ qua thay vì làm hỏng cả bản ghi. */
export const subjectsSummarySchema = z.object({
  tien_tieu_hoc: storedSubjectEntry.optional(),
  luyen_chu: storedSubjectEntry.optional(),
  toan_tu_duy: storedSubjectEntry.optional(),
});

export type SubjectsSummary = z.infer<typeof subjectsSummarySchema>;

// ---------------------------------------------------------------------------
// Form "Viết sổ liên lạc" của giáo viên — dùng chung React Hook Form (client) + Server Action
// ---------------------------------------------------------------------------
export const MOODS = ["happy", "neutral", "focused", "tired"] as const;
export const MAX_MEDIA = 20;

/** {student_id}/{yyyy-mm-dd}/{tên file}.{đuôi ảnh/video} */
export const MEDIA_PATH_RE =
  /^[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[\w.-]{1,100}\.(jpe?g|png|webp|gif|heic|heif|svg|mp4|mov|m4v|webm|3gp)$/i;

const subjectInput = z.object({
  rating: z.number().int().min(1, "Từ 1 đến 5 sao").max(5, "Từ 1 đến 5 sao").nullable(),
  comment: z.string().trim().max(500, "Tối đa 500 ký tự"),
  // Tiêu chí chưa chấm: null / undefined (ô chưa chạm)
  criteria: z.record(z.string(), z.number().int().min(1).max(5).nullish()),
});

export const dailyReportFormSchema = z
  .object({
    studentId: uuidSchema,
    classKey: z.string().min(1, "Thiếu lớp học"),
    date: schoolDaySchema,
    mood: z.enum(MOODS).nullable(),
    subjects: z.object({
      tien_tieu_hoc: subjectInput,
      luyen_chu: subjectInput,
      toan_tu_duy: subjectInput,
    }),
    teacherNote: z.string().trim().max(2000, "Nhận xét tối đa 2000 ký tự"),
    media: z
      .array(z.string().regex(MEDIA_PATH_RE, "Đường dẫn ảnh/video không hợp lệ"))
      .max(MAX_MEDIA, `Tối đa ${MAX_MEDIA} ảnh/video`),
    applyNoteToClass: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.media.some((p) => !p.startsWith(`${v.studentId}/`))) {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Có ảnh/video không thuộc học sinh này" });
    }
    const hasSubject = Object.values(v.subjects).some(
      (s) => s.rating !== null || s.comment.trim() !== "" || Object.values(s.criteria).some((c) => typeof c === "number"),
    );
    if (!v.mood && !hasSubject && !v.teacherNote.trim() && v.media.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["teacherNote"],
        message: "Hãy nhập ít nhất một nội dung: tâm trạng, đánh giá môn, nhận xét hoặc ảnh.",
      });
    }
    if (v.applyNoteToClass && !v.teacherNote.trim()) {
      ctx.addIssue({ code: "custom", path: ["teacherNote"], message: "Nhập nhận xét chung để áp dụng cho cả lớp." });
    }
  });

export type DailyReportFormValues = z.infer<typeof dailyReportFormSchema>;
