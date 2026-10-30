import "server-only";
import { isISODate, startOfMonth, todayVN } from "@/lib/date";
import { getTeacherContext } from "@/features/teacher/queries";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { getMonthlySummary } from "@/features/monthly-summary/queries";
import { SummaryEditor } from "@/features/monthly-summary/components/summary-editor";
import { getStudentProgress } from "@/features/progress/queries";
import { AnalyticsPicker } from "@/features/progress/components/analytics-picker";
import { ProgressReport, monthTitle } from "@/features/progress/components/progress-report";

export type AnalyticsSearchParams = Record<string, string | string[] | undefined>;

/**
 * Màn phân tích học sinh — dùng chung cho giáo viên (/teacher, lớp mình phụ trách) và quản trị (/admin, mọi lớp; RLS quyết định).
 * `basePath`: đường dẫn trang chứa màn này (để tạo link chuyển tháng).
 */
export async function StudentAnalyticsScreen({ params, basePath }: { params: AnalyticsSearchParams; basePath: string }) {
  const { today, classes, selected } = await getTeacherContext(params);

  if (!selected || selected.students.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Phân tích học sinh</h1>
        <NoClasses />
      </div>
    );
  }

  const student = selected.students.find((s) => s.id === params.student) ?? selected.students[0]!;
  const now = todayVN();
  const month = startOfMonth(isISODate(params.month) && params.month <= now ? params.month : today);
  const [progress, summary] = await Promise.all([getStudentProgress(student.id, month, now), getMonthlySummary(student.id, month)]);

  const hrefForMonth = (m: string) => {
    const q = new URLSearchParams({ class: selected.key, student: student.id });
    if (m !== startOfMonth(now)) q.set("month", m);
    return `${basePath}?${q}`;
  };

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-xl font-extrabold">Phân tích học sinh</h1>
        <p className="text-sm text-muted-foreground">Theo dõi chuyên cần, tiến bộ từng tiêu chí và gửi nhận xét tổng kết tháng cho phụ huynh.</p>
      </div>
      <AnalyticsPicker
        classes={classes.map((c) => ({ key: c.key, label: c.label, count: c.students.length }))}
        classKey={selected.key}
        students={selected.students.map((s) => ({ id: s.id, full_name: s.full_name }))}
        studentId={student.id}
        month={month === startOfMonth(now) ? undefined : month}
      />
      <ProgressReport
        student={student}
        progress={progress}
        month={month}
        today={now}
        hrefForMonth={hrefForMonth}
        summary={
          <SummaryEditor
            key={`${student.id}|${month}`}
            studentId={student.id}
            studentName={student.full_name}
            month={month}
            monthLabel={monthTitle(month)}
            existing={summary.summary}
            available={summary.available}
          />
        }
      />
    </div>
  );
}
