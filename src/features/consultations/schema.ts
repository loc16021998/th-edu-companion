import { z } from "zod";
import { uuidSchema } from "@/lib/validation";
import { AUDIENCES, CONSULT_MODES, MEETING_MINUTES, SLOT_MINUTES } from "./constants";
import { minutesOf } from "./time";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ");
const httpsUrl = z
  .string()
  .trim()
  .max(300, "Link quá dài")
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Link họp phải bắt đầu bằng https://")
  .transform((v) => v || null);

export const availabilitySchema = z
  .object({
    id: z.string().uuid().optional(),
    weekday: z.number().int().min(1).max(7),
    start: hhmm,
    end: hhmm,
    slotMinutes: z.number().refine((n) => (SLOT_MINUTES as readonly number[]).includes(n), "Độ dài mỗi ô không hợp lệ"),
    mode: z.enum(CONSULT_MODES),
    meetingUrl: httpsUrl.optional().default(""),
    location: z
      .string()
      .trim()
      .max(160, "Địa điểm tối đa 160 ký tự")
      .transform((v) => v || null)
      .optional()
      .default(""),
    /** Chỉ quản trị viên chọn; giáo viên luôn là "parents" (DB tự ép) */
    audience: z.enum(AUDIENCES).default("parents"),
    active: z.boolean().default(true),
  })
  .refine((v) => minutesOf(v.start) >= 6 * 60 && minutesOf(v.end) <= 22 * 60, { message: "Khung giờ trong khoảng 06:00 – 22:00", path: ["start"] })
  .refine((v) => minutesOf(v.end) - minutesOf(v.start) >= v.slotMinutes, { message: "Giờ kết thúc phải sau giờ bắt đầu ít nhất 1 ô hẹn", path: ["end"] });
export type AvailabilityInput = z.input<typeof availabilitySchema>;

export const bookSchema = z.object({
  /** Phụ huynh: bắt buộc (bé được trao đổi); giáo viên: không bắt buộc */
  studentId: uuidSchema.nullable().optional(),
  hostId: z.string().uuid("Chưa chọn người trao đổi"),
  startsAt: z.string().datetime({ offset: true, message: "Chưa chọn giờ hẹn" }),
  topic: z.string().trim().min(5, "Nội dung muốn trao đổi ít nhất 5 ký tự").max(500, "Tối đa 500 ký tự"),
});

/** Quản trị viên lên lịch trực tiếp (xác nhận ngay) */
export const adminScheduleSchema = z.object({
  hostId: z.string().uuid("Chưa chọn người chủ trì"),
  guestId: z.string().uuid("Chưa chọn người được mời"),
  studentId: uuidSchema.nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chưa chọn ngày"),
  time: hhmm,
  minutes: z.number().refine((n) => (MEETING_MINUTES as readonly number[]).includes(n), "Thời lượng không hợp lệ"),
  mode: z.enum(CONSULT_MODES),
  topic: z.string().trim().min(5, "Nội dung trao đổi ít nhất 5 ký tự").max(500, "Tối đa 500 ký tự"),
  meetingUrl: httpsUrl.optional().default(""),
  location: z.string().trim().max(160, "Địa điểm tối đa 160 ký tự").optional().default(""),
});
export type AdminScheduleInput = z.input<typeof adminScheduleSchema>;

export const decideSchema = z.object({
  id: z.string().uuid(),
  confirm: z.boolean(),
  note: z.string().trim().max(300, "Tối đa 300 ký tự").optional().default(""),
  meetingUrl: httpsUrl.optional().default(""),
});

export const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(300, "Tối đa 300 ký tự").optional().default(""),
});
