import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const shiftSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên ca").max(60, "Tên ca tối đa 60 ký tự"),
    startTime: z.string().regex(TIME_RE, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(TIME_RE, "Giờ kết thúc không hợp lệ"),
    weekdays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, "Chọn ít nhất một ngày học")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "Giờ kết thúc phải sau giờ bắt đầu" });

export type ShiftInput = z.infer<typeof shiftSchema>;

export const assignShiftSchema = z.object({
  classId: z.string().uuid("Lớp không hợp lệ"),
  shiftId: z.string().uuid("Ca học không hợp lệ").nullable(),
});
