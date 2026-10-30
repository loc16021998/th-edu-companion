import "server-only";
import Link from "next/link";
import { Eye, Star } from "lucide-react";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { cn } from "@/lib/utils";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { AnalyticsPicker } from "@/features/progress/components/analytics-picker";
import { getClassHomeworkStatus, getStarLeaderboard, listClassAssignments, listParentHomework } from "../queries";
import { ParentHomeworkCard } from "../components/parent-homework-card";
import { StarLeaderboard } from "../components/star-leaderboard";

type Params = Record<string, string | string[] | undefined>;

/**
 * Quản trị theo dõi tab "Bài tập" của phụ huynh: tổng hợp nộp bài cả lớp + xem đúng màn phụ huynh của từng bé (chỉ xem).
 * `basePath`: /admin/homework.
 */
export async function HomeworkMonitorScreen({ params, basePath }: { params: Params; basePath: string }) {
  const { today, classes, selected: cls } = await getTeacherContext(params);
  if (!cls || cls.students.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Bài tập về nhà</h1>
        <NoClasses />
      </div>
    );
  }

  const student = cls.students.find((s) => s.id === params.student) ?? cls.students[0]!;
  const [assignments, status, board, homework] = await Promise.all([
    listClassAssignments(cls.campus, cls.className),
    getClassHomeworkStatus(cls.campus, cls.className),
    getStarLeaderboard(cls.campus, cls.className, today),
    listParentHomework(student),
  ]);
  const total = assignments.items.length;
  const href = (studentId: string) => `${basePath}?${new URLSearchParams({ class: cls.key, student: studentId })}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Bài tập về nhà</h1>
        <p className="text-sm text-muted-foreground">Theo dõi tab “Bài tập” của phụ huynh: tình hình nộp bài cả lớp và đúng màn hình phụ huynh từng bé đang thấy.</p>
      </div>

      {!assignments.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có bảng bài tập — chạy file <code>supabase/apply-homework.sql</code> trong Supabase SQL Editor.
        </p>
      ) : (
        <>
          <AnalyticsPicker
            classes={classes.map((c) => ({ key: c.key, label: c.label, count: c.students.length }))}
            classKey={cls.key}
            students={cls.students.map((s) => ({ id: s.id, full_name: s.full_name }))}
            studentId={student.id}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Tổng hợp cả lớp */}
            <section className="space-y-3">
              <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="font-bold">Lớp {cls.className}</h2>
                  <span className="text-xs text-muted-foreground">{total} bài đã giao</span>
                </div>
                <ul className="divide-y">
                  {cls.students.map((s) => {
                    const st = status.get(s.id) ?? { submitted: 0, graded: 0, stars: 0 };
                    const missing = Math.max(total - st.submitted, 0);
                    const active = s.id === student.id;
                    return (
                      <li key={s.id}>
                        <Link
                          href={href(s.id)}
                          aria-current={active ? "true" : undefined}
                          className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60", active && "bg-primary/5")}
                        >
                          <StudentAvatar student={s} className="size-9" />
                          <div className="min-w-0 flex-1">
                            <p className={cn("break-words text-sm font-semibold", active && "text-primary")}>{s.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {st.submitted}/{total} đã nộp · {st.graded} đã chấm
                              {st.submitted - st.graded > 0 && <span className="font-semibold text-sky-700"> · {st.submitted - st.graded} chờ chấm</span>}
                              {missing > 0 && <span className="font-semibold text-amber-700"> · {missing} chưa nộp</span>}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-amber-700">
                            <Star className="size-4 fill-amber-400 text-amber-400" /> {st.stars}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <StarLeaderboard rows={board.rows} from={board.from} to={board.to} limit={50} highlightId={student.id} mineLabel="Đang xem" />
            </section>

            {/* Màn phụ huynh của bé đang chọn */}
            <section className="space-y-3">
              <p className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                <Eye className="size-4" /> Phụ huynh của {student.full_name} đang thấy (chỉ xem)
              </p>
              {homework.items.length === 0 ? (
                <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Lớp chưa có bài tập nào.</p>
              ) : (
                homework.items.map((item) => <ParentHomeworkCard key={item.assignment.id} item={item} studentId={student.id} today={today} readOnly />)
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
