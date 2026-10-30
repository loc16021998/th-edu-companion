import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, MapPin, NotebookPen, Users } from "lucide-react";
import { SessionBanner } from "@/components/shared/session-banner";
import { CAMPUS_LABELS, isAbsence } from "@/config/constants";
import { cn } from "@/lib/utils";
import { getAuthContext } from "@/features/auth/queries";
import { listAttendanceOn } from "@/features/attendance/queries";
import { listReportsOn } from "@/features/daily-reports/queries";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";

export const metadata: Metadata = { title: "Tổng quan lớp học" };

function Progress({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default async function TeacherDashboardPage() {
  const [ctx, { today, classes }] = await Promise.all([getAuthContext(), getTeacherContext({})]);
  const ids = classes.flatMap((c) => c.students.map((s) => s.id));
  const [attendance, reports] = await Promise.all([listAttendanceOn(ids, today), listReportsOn(ids, today)]);

  const attended = new Map(attendance.map((a) => [a.student_id, a.status]));
  const reported = new Set(reports.map((r) => r.student_id));
  const total = ids.length;
  const present = attendance.filter((a) => !isAbsence(a.status)).length;
  const absent = attendance.filter((a) => isAbsence(a.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Xin chào, {ctx?.profile.full_name || "thầy cô"} 👋</h1>
      </div>

      <SessionBanner today={today} />

      {/* Lối tắt */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/teacher/attendance"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-edu-blue-500 to-edu-blue-700 p-4 text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
        >
          <ClipboardCheck className="size-8" />
          <p className="mt-3 font-extrabold leading-tight">Điểm danh hôm nay</p>
          <p className="mt-0.5 text-xs font-medium text-white/85">
            {attendance.length}/{total} đã điểm danh
          </p>
          <ChevronRight className="absolute right-3 top-3 size-5 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/teacher/daily-report"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 p-4 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98]"
        >
          <NotebookPen className="size-8" />
          <p className="mt-3 font-extrabold leading-tight">Viết sổ liên lạc</p>
          <p className="mt-0.5 text-xs font-medium text-white/85">
            {reported.size}/{total} đã viết
          </p>
          <ChevronRight className="absolute right-3 top-3 size-5 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {classes.length === 0 ? (
        <NoClasses />
      ) : (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold">Lớp của tôi</h2>
            <p className="text-xs font-medium text-muted-foreground">
              {total} học sinh · {present} đi học · {absent} vắng
            </p>
          </div>

          <ul className="grid gap-3 md:grid-cols-2">
            {classes.map((c) => {
              const size = c.students.length;
              const att = c.students.filter((s) => attended.has(s.id)).length;
              const rep = c.students.filter((s) => reported.has(s.id)).length;
              const absentInClass = c.students.filter((s) => isAbsence(attended.get(s.id))).length;
              const q = `?class=${encodeURIComponent(c.key)}`;
              return (
                <li key={c.key} className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-extrabold">Lớp {c.className}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <MapPin className="size-3.5" /> {CAMPUS_LABELS[c.campus]}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-700">
                      <Users className="size-4" /> {size}
                      <span className="sr-only">học sinh</span>
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <Progress label={`Điểm danh${absentInClass ? ` · ${absentInClass} vắng` : ""}`} done={att} total={size} color="bg-emerald-500" />
                    <Progress label="Sổ liên lạc" done={rep} total={size} color="bg-orange-400" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/teacher/attendance${q}`}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-100"
                    >
                      <ClipboardCheck className="size-4" /> Điểm danh
                    </Link>
                    <Link
                      href={`/teacher/daily-report${q}`}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-orange-50 text-sm font-semibold text-orange-700 ring-1 ring-orange-200 active:bg-orange-100"
                    >
                      <NotebookPen className="size-4" /> Sổ liên lạc
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
