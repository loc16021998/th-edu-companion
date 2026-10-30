import { z } from "zod";
import { isISODate } from "@/lib/date";
import { HOMEWORK_MEDIA_RE, HOMEWORK_VOICE_RE, MAX_HOMEWORK_FILES } from "./constants";

export const createAssignmentSchema = z.object({
  classKey: z.string().min(1, "Vui lòng chọn lớp"),
  title: z.string().trim().min(2, "Vui lòng nhập tên bài tập").max(120, "Tên bài tập tối đa 120 ký tự"),
  instructions: z.string().trim().max(1500, "Hướng dẫn tối đa 1500 ký tự"),
  subject: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.enum(["tien_tieu_hoc", "luyen_chu", "toan_tu_duy"]).nullable()),
  submissionType: z.enum(["any", "photo", "video"]),
  dueDate: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || isISODate(v), "Hạn nộp không hợp lệ"),
});

export const submitHomeworkSchema = z
  .object({
    assignmentId: z.string().uuid("Bài tập không hợp lệ"),
    studentId: z.string().uuid("Học sinh không hợp lệ"),
    mediaPaths: z
      .array(z.string().regex(HOMEWORK_MEDIA_RE, "Đường dẫn ảnh/video không hợp lệ"))
      .min(1, "Vui lòng tải lên ít nhất 1 ảnh hoặc video bài làm")
      .max(MAX_HOMEWORK_FILES, `Tối đa ${MAX_HOMEWORK_FILES} ảnh/video`),
    note: z.string().trim().max(500, "Lời nhắn tối đa 500 ký tự"),
  })
  .refine((v) => v.mediaPaths.every((p) => p.startsWith(`${v.studentId}/${v.assignmentId}/`)), {
    path: ["mediaPaths"],
    message: "Có ảnh/video không thuộc bài tập này",
  });

export type SubmitHomeworkInput = z.infer<typeof submitHomeworkSchema>;

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid("Bài nộp không hợp lệ"),
  hearted: z.boolean(),
  stars: z.number().int().min(1, "Tặng bé từ 1 đến 3 sao").max(3, "Tặng bé từ 1 đến 3 sao"),
  comment: z.string().trim().max(1000, "Nhận xét tối đa 1000 ký tự"),
  voicePath: z.string().regex(HOMEWORK_VOICE_RE, "File ghi âm không hợp lệ").nullable(),
});

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
