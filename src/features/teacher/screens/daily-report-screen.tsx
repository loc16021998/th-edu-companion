import "server-only";
import { MousePointerClick } from "lucide-react";
import { listAttendanceOn } from "@/features/attendance/queries";
import { getDailyReportOn, listReportsOn } from "@/features/daily-reports/queries";
import type { DailyReportFormValues } from "@/features/daily-reports/schema";
import { getTeacherContext } from "@/features/teacher/queries";
import { ClassDatePicker } from "@/features/teacher/components/class-date-picker";
import { DailyReportForm } from "@/features/teacher/components/daily-report-form";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { StudentPicker } from "@/features/teacher/components/student-picker";
import { isAbsence } from "@/config/constants";

import type { ScreenSearchParams } from "./attendance-screen";

/** Màn viết sổ liên lạc — `basePath`: đường dẫn trang chứa màn này (/teacher/daily-report hoặc /admin/daily-report). */
export async function DailyReportScreen({ params, basePath }: { params: ScreenSearchParams; basePath: string }) {
  const { today, date, classes, selected: cls } = await getTeacherContext(params);

  if (!cls) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Sổ liên lạc</h1>
        <NoClasses />
      </div>
    );
  }

  const roster = cls.students;
  const ids = roster.map((s) => s.id);
  const [attendance, reports] = await Promise.all([listAttendanceOn(ids, date), listReportsOn(ids, date)]);
  const attendanceById = new Map(attendance.map((a) => [a.student_id, a.status]));
  const reportById = new Map(reports.map((r) => [r.student_id, r]));

  const student = roster.find((s) => s.id === params.student) ?? null;
  const existing = student ? await getDailyReportOn(student.id, date) : null;

  const base = new URLSearchParams({ class: cls.key, date });
  const hrefFor = (studentId: string) => `${basePath}?${base}&student=${studentId}`;

  // Bạn tiếp theo chưa có sổ (vòng lại đầu danh sách), bỏ qua bạn vắng
  let nextHref: string | null = null;
  if (student) {
    const start = roster.indexOf(student);
    const ordered = [...roster.slice(start + 1), ...roster.slice(0, start)];
    const next = ordered.find((s) => !reportById.has(s.id) && !isAbsence(attendanceById.get(s.id)));
    nextHref = next ? hrefFor(next.id) : null;
  }

  const defaults: DailyReportFormValues | null = student
    ? {
        studentId: student.id,
        classKey: cls.key,
        date,
        mood: existing?.mood ?? null,
        subjects: {
          tien_tieu_hoc: {
            rating: existing?.subjects_summary.tien_tieu_hoc?.rating ?? null,
            comment: existing?.subjects_summary.tien_tieu_hoc?.comment ?? "",
            criteria: { ...existing?.subjects_summary.tien_tieu_hoc?.criteria },
          },
          luyen_chu: {
            rating: existing?.subjects_summary.luyen_chu?.rating ?? null,
            comment: existing?.subjects_summary.luyen_chu?.comment ?? "",
            criteria: { ...existing?.subjects_summary.luyen_chu?.criteria },
          },
          toan_tu_duy: {
            rating: existing?.subjects_summary.toan_tu_duy?.rating ?? null,
            comment: existing?.subjects_summary.toan_tu_duy?.comment ?? "",
            criteria: { ...existing?.subjects_summary.toan_tu_duy?.criteria },
          },
        },
        teacherNote: existing?.teacher_note ?? "",
        // Chỉ giữ ảnh còn tồn tại (đã ký URL được) — ảnh hỏng tự rơi ra khi lưu lại
        media: existing?.media.map((m) => m.path) ?? [],
        applyNoteToClass: false,
      }
    : null;

  return (
    <div className="space-y-4">
      <h1 className={student ? "hidden text-xl font-extrabold md:block" : "text-xl font-extrabold"}>Sổ liên lạc</h1>
      <div className={student ? "hidden md:block" : undefined}>
        <ClassDatePicker
          classes={classes.map((c) => ({ key: c.key, label: c.label, count: c.students.length }))}
          classKey={cls.key}
          date={date}
          today={today}
          studentId={student?.id}
        />
      </div>

      <div className="md:grid md:grid-cols-[18rem_1fr] md:items-start md:gap-6">
        <StudentPicker
          className={student ? "hidden md:block md:sticky md:top-20" : undefined}
          rows={roster.map((s) => ({
            id: s.id,
            full_name: s.full_name,
            avatar_url: s.avatar_url,
            attendance: attendanceById.get(s.id) ?? null,
            report: reportById.get(s.id) ?? null,
          }))}
          selectedId={student?.id ?? null}
          hrefFor={hrefFor}
        />

        {student && defaults ? (
          <DailyReportForm
            key={`${student.id}|${date}`}
            student={{ id: student.id, full_name: student.full_name, avatar_url: student.avatar_url }}
            attendanceStatus={attendanceById.get(student.id) ?? null}
            defaults={defaults}
            existingMedia={existing?.media.map((m) => ({ path: m.path, url: m.url, type: m.type })) ?? []}
            isExisting={!!existing}
            classmatesCount={roster.filter((s) => s.id !== student.id && !isAbsence(attendanceById.get(s.id))).length}
            backHref={`${basePath}?${base}`}
            nextHref={nextHref}
          />
        ) : (
          <div className="hidden flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card py-20 text-center text-muted-foreground md:flex">
            <MousePointerClick className="size-8" />
            <p className="font-semibold">Chọn một học sinh để viết sổ liên lạc</p>
          </div>
        )}
      </div>
    </div>
  );
}
