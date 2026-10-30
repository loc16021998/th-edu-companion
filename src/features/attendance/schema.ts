import { z } from "zod";
import { schoolDaySchema, uuidSchema } from "@/lib/validation";

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "absent_with_permission"] as const;

export const saveAttendanceSchema = z.object({
  date: schoolDaySchema,
  records: z
    .array(
      z.object({
        studentId: uuidSchema,
        status: z.enum(ATTENDANCE_STATUSES, { errorMap: () => ({ message: "Vui lòng chọn trạng thái" }) }),
        note: z.string().trim().max(200, "Ghi chú tối đa 200 ký tự"),
      }),
    )
    .min(1, "Lớp chưa có học sinh")
    .max(200, "Tối đa 200 học sinh mỗi lần lưu")
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        if (seen.has(r.studentId)) ctx.addIssue({ code: "custom", path: [i, "studentId"], message: "Học sinh bị trùng" });
        seen.add(r.studentId);
      });
    }),
});

export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
