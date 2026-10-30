import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listAttendanceBetween } from "@/features/attendance/queries";
import { cacheEnabled, listChildAttendanceCached } from "@/features/parent/cached";
import { listDailyReportsBetween } from "@/features/daily-reports/queries";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { resolvePeriod, type PeriodView } from "@/features/parent/period";
import { AttendanceStats } from "@/features/parent/components/attendance-stats";
import { MonthCalendar } from "@/features/parent/components/month-calendar";
import { NoChildren } from "@/features/parent/components/no-children";
import { PeriodFilter } from "@/features/parent/components/period-filter";
import { WeekTimeline } from "@/features/parent/components/week-timeline";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Chuyên cần" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { students, child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const period = resolvePeriod(params.view, params.date, today);
  const [attendance, reports] = await Promise.all([
    (cacheEnabled() ? listChildAttendanceCached : listAttendanceBetween)(child.id, period.from, period.to),
    listDailyReportsBetween(child.id, period.from, period.to),
  ]);

  // Chỉ gắn ?child= khi có nhiều con để URL gọn
  const childId = students.length > 1 ? child.id : undefined;
  const hrefFor = (view: PeriodView, date?: string) =>
    childHref("/parent/attendance", childId, { view: view === "week" ? "week" : undefined, date });

  const attendanceByDate = new Map(attendance.map((a) => [a.date, a]));
  const reportByDate = new Map(reports.map((r) => [r.date, r]));

  return (
    <div className="space-y-5">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["attendance", "daily_report"]} studentId={child.id} from={period.from} to={period.to} />
      <h1 className="text-xl font-extrabold">Chuyên cần của con</h1>


      <PeriodFilter period={period} hrefFor={hrefFor} />

      <AttendanceStats records={attendance} />

      {period.view === "month" ? (
        <MonthCalendar
          from={period.from}
          to={period.to}
          today={today}
          statusByDate={new Map(attendance.map((a) => [a.date, a.status]))}
          moodByDate={new Map(reports.map((r) => [r.date, r.mood]))}
          hrefForDay={(day) => hrefFor("week", day)}
        />
      ) : (
        <WeekTimeline
          from={period.from}
          to={period.to}
          today={today}
          attendanceByDate={attendanceByDate}
          reportByDate={reportByDate}
        />
      )}

      {period.view === "month" && (
        <p className="text-center text-xs text-muted-foreground">Chạm vào một ngày để xem nhận xét chi tiết của tuần đó.</p>
      )}
    </div>
  );
}
