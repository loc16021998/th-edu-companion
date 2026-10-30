import "server-only";
import { listAttendanceOn } from "@/features/attendance/queries";
import { getTeacherContext } from "@/features/teacher/queries";
import { AttendanceForm } from "@/features/teacher/components/attendance-form";
import { AttendanceReview } from "@/features/teacher/components/attendance-review";
import { ClassDatePicker } from "@/features/teacher/components/class-date-picker";
import { NoClasses } from "@/features/teacher/components/no-classes";

export type ScreenSearchParams = Record<string, string | string[] | undefined>;

/**
 * Màn điểm danh học sinh — dùng chung cho giáo viên (/teacher) và quản trị viên (/admin).
 * `mode`: "edit" (giáo viên: điểm danh ngay) · "review" (quản trị: chỉ xem, có nút Sửa).
 */
export async function AttendanceScreen({ params, mode = "edit" }: { params: ScreenSearchParams; mode?: "edit" | "review" }) {
  const { today, date, classes, selected } = await getTeacherContext(params);

  if (!selected) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Điểm danh</h1>
        <NoClasses />
      </div>
    );
  }

  const students = selected.students.map((s) => ({ id: s.id, full_name: s.full_name, avatar_url: s.avatar_url }));
  const records = await listAttendanceOn(
    students.map((s) => s.id),
    date,
  );
  const saved = Object.fromEntries(records.map((r) => [r.student_id, { status: r.status, note: r.note }]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Điểm danh</h1>
      <ClassDatePicker
        classes={classes.map((c) => ({ key: c.key, label: c.label, count: c.students.length }))}
        classKey={selected.key}
        date={date}
        today={today}
      />
      {/* key: đổi lớp/ngày → form khởi tạo lại với dữ liệu mới */}
      {mode === "review" ? (
        <AttendanceReview key={`${selected.key}|${date}`} date={date} students={students} saved={saved} />
      ) : (
        <AttendanceForm key={`${selected.key}|${date}`} date={date} students={students} saved={saved} />
      )}
    </div>
  );
}
