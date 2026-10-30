import "server-only";
import { isISODate, todayVN } from "@/lib/date";
import { latestSchoolDay } from "@/lib/schedule";
import { listStudents } from "@/features/students/queries";
import { groupByClass, pickClass } from "./classes";

/**
 * Lớp giáo viên được xem (RLS) + lớp đang chọn qua ?class= + ngày học hợp lệ:
 * không ở tương lai, Chủ nhật (nghỉ) → lùi về Thứ 7 liền trước.
 */
export async function getTeacherContext(params: { class?: string | string[]; date?: string | string[] }) {
  const today = todayVN();
  const classes = groupByClass(await listStudents());
  const selected = pickClass(classes, params.class);
  const date = latestSchoolDay(isISODate(params.date) && params.date <= today ? params.date : today);
  return { today, date, classes, selected };
}
