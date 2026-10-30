import { z } from "zod";
import { pastOrTodaySchema, uuidSchema } from "@/lib/validation";
import { BADGE_TONES } from "./constants";

export const setStarsSchema = z.object({
  studentId: uuidSchema,
  date: pastOrTodaySchema,
  /** 0 = bỏ sao của buổi đó */
  stars: z.number().int().min(0).max(3),
});

export const toggleBadgeSchema = z.object({
  studentId: uuidSchema,
  badgeId: z.string().uuid("Huy hiệu không hợp lệ"),
  date: pastOrTodaySchema,
  on: z.boolean(),
});

export const classStarsSchema = z.object({
  studentIds: z.array(uuidSchema).min(1, "Chưa có bé nào để tặng sao").max(80),
  date: pastOrTodaySchema,
  stars: z.number().int().min(1).max(3),
});

export const rewardSchema = z.object({
  studentId: uuidSchema,
  milestoneId: z.string().uuid("Mốc quà không hợp lệ"),
  given: z.boolean(),
});

const emoji = z.string().trim().min(1, "Chọn biểu tượng").max(16, "Biểu tượng quá dài");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const badgeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Tên huy hiệu ít nhất 2 ký tự").max(40, "Tên tối đa 40 ký tự"),
  emoji,
  description: optionalText(160),
  tone: z.enum(BADGE_TONES),
  active: z.boolean(),
});
export type BadgeInput = z.input<typeof badgeSchema>;

export const milestoneSchema = z.object({
  id: z.string().uuid().optional(),
  starsRequired: z.number().int("Số sao phải là số nguyên").min(1, "Ít nhất 1 sao").max(10000, "Tối đa 10.000 sao"),
  title: z.string().trim().min(2, "Tên quà ít nhất 2 ký tự").max(60, "Tên quà tối đa 60 ký tự"),
  emoji,
  description: optionalText(160),
  active: z.boolean(),
});
export type MilestoneInput = z.input<typeof milestoneSchema>;
