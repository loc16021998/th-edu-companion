import type { Metadata } from "next";
import { isISODate, todayVN } from "@/lib/date";
import { latestSchoolDay } from "@/lib/schedule";
import { listProfilesByRole, listTeacherAttendanceOn } from "@/features/admin/queries";
import { TeacherAttendanceForm } from "@/features/admin/components/teacher-attendance-form";

export const metadata: Metadata = { title: "Chấm công giáo viên" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminTeacherAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = todayVN();
  // Không ở tương lai; Chủ nhật (nghỉ) → Thứ 7 liền trước
  const date = latestSchoolDay(isISODate(params.date) && params.date <= today ? params.date : today);

  const [teachers, records] = await Promise.all([listProfilesByRole("teacher"), listTeacherAttendanceOn(date)]);
  const saved = Object.fromEntries(records.map((r) => [r.teacher_id, { status: r.status, note: r.note }]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Chấm công giáo viên</h1>
      {/* key: đổi ngày → form khởi tạo lại với dữ liệu của buổi đó */}
      <TeacherAttendanceForm key={date} date={date} today={today} teachers={teachers} saved={saved} />
    </div>
  );
}
