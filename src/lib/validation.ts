import { z } from "zod";
import { isISODate, todayVN } from "@/lib/date";
import { isSchoolDay } from "@/lib/schedule";

/** YYYY-MM-DD hợp lệ và không ở tương lai (theo giờ Việt Nam). Dùng chung client + server. */
export const pastOrTodaySchema = z
  .string({ required_error: "Vui lòng chọn ngày" })
  .refine(isISODate, "Ngày không hợp lệ")
  .refine((d) => d <= todayVN(), "Không thể chọn ngày trong tương lai");

/** Ngày có buổi học (Thứ 2 – Thứ 7), không ở tương lai — cho điểm danh, sổ liên lạc, chấm công. */
export const schoolDaySchema = pastOrTodaySchema.refine(
  (d) => isSchoolDay(d),
  "Chủ nhật không có buổi học (lịch học Thứ 2 – Thứ 7)",
);

export const uuidSchema = z.string().uuid("Mã học sinh không hợp lệ");

/**
 * Chặn tham số "id" của Server Action ngay cửa vào: Server Action là endpoint công khai, client có thể
 * gửi bất cứ thứ gì (object, chuỗi rất dài…) chứ không chỉ đúng kiểu TypeScript khai báo.
 */
export function isUuid(value: unknown): value is string {
  return z.string().uuid().safeParse(value).success;
}

export const INVALID_ID = "Dữ liệu không hợp lệ.";
