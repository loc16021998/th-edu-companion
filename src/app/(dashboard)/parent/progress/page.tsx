import type { Metadata } from "next";
import { isISODate, startOfMonth, todayVN } from "@/lib/date";
import { enrolledSubjects } from "@/lib/subjects";
import { givenName } from "@/lib/utils";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { getMonthlySummary } from "@/features/monthly-summary/queries";
import { SummaryCard } from "@/features/monthly-summary/components/summary-card";
import { getStudentProgress } from "@/features/progress/queries";
import { ProgressReport, monthTitle } from "@/features/progress/components/progress-report";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Tiến độ học tập" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentProgressPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { students, child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const month = startOfMonth(isISODate(params.month) && params.month <= today ? params.month : today);
  const [fullProgress, summary] = await Promise.all([getStudentProgress(child.id, month, today), getMonthlySummary(child.id, month)]);
  // Phụ huynh chỉ xem tiến bộ các môn con đã đăng ký
  const enrolled = new Set(enrolledSubjects(child));
  const progress = { ...fullProgress, subjects: fullProgress.subjects.filter((s) => enrolled.has(s.key)) };

  const childId = students.length > 1 ? child.id : undefined;
  const hrefForMonth = (m: string) => childHref("/parent/progress", childId, { month: m === startOfMonth(today) ? undefined : m });

  return (
    <div className="space-y-4">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["monthly_summary"]} studentId={child.id} />
      <h1 className="text-xl font-extrabold print:hidden">Tiến độ học tập của {givenName(child.full_name)}</h1>
      <div className="print:hidden">
      </div>
      <ProgressReport
        student={child}
        progress={progress}
        month={month}
        today={today}
        hrefForMonth={hrefForMonth}
        summary={<SummaryCard summary={summary.summary} monthLabel={monthTitle(month)} />}
        // Phụ huynh chỉ xem: không chuyển tháng, không xuất PDF, không nút trong biểu đồ
        readOnly
      />
    </div>
  );
}
