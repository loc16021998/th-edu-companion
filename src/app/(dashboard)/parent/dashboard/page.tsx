import type { Metadata } from "next";
import { Images } from "lucide-react";
import { SessionBanner } from "@/components/shared/session-banner";
import { startOfMonth, todayVN, relativeDayLabel } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { getAttendanceOn } from "@/features/attendance/queries";
import { getLatestDailyReport } from "@/features/daily-reports/queries";
import { getSelectedChild } from "@/features/parent/children";
import { LessonDiary } from "@/features/parent/components/lesson-diary";
import { MediaGallery } from "@/features/parent/components/media-gallery";
import { NoChildren } from "@/features/parent/components/no-children";
import { EmptyState, Section } from "@/features/parent/components/section";
import { StudentCard } from "@/features/parent/components/student-card";
import { FamilyGreeting } from "@/features/parent/components/family-greeting";
import { TodayStatus } from "@/features/parent/components/today-status";
import { DEFAULT_SHIFT } from "@/lib/shifts";
import { getClassShift } from "@/features/shifts/queries";
import { getCampusProfiles } from "@/features/campuses/queries";
import { PickupWidget } from "@/features/campuses/components/pickup-widget";
import { childHref } from "@/features/parent/children";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { getChildAchievements } from "@/features/achievements/queries";
import { AchievementSummaryCard } from "@/features/achievements/components/achievement-summary-card";

export const metadata: Metadata = { title: "Học tập" };

/** Lời chào theo giờ Việt Nam (tính ở server → HTML khớp khi hydrate). */
function timeGreeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const [attendance, report, { campuses }, shift, achievements] = await Promise.all([
    getAttendanceOn(child.id, today),
    getLatestDailyReport(child.id),
    getCampusProfiles(),
    getClassShift(child.campus, child.class_name),
    getChildAchievements(child, startOfMonth(today), today, { leaderboard: false }),
  ]);
  const campus = campuses.find((c) => c.campus === child.campus);

  return (
    <div className="space-y-6">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["attendance", "daily_report"]} studentId={child.id} from={today} to={today} />

      <FamilyGreeting timeGreeting={timeGreeting()} />

      <StudentCard student={child} today={today} />

      <SessionBanner today={today} />

      <TodayStatus
        today={today}
        attendance={attendance}
        mood={report?.date === today ? report.mood : null}
      />

      <AchievementSummaryCard
        data={achievements}
        studentId={child.id}
        childName={givenName(child.full_name)}
        href={childHref("/parent/achievements", params.child === child.id ? child.id : undefined)}
      />

      {/* Đưa đón: đúng cơ sở bé học + chỉ đường / gọi cô 1 chạm (không có bản đồ → nhẹ) */}
      {campus && (
        <PickupWidget
          childName={child.full_name}
          className={child.class_name}
          campus={campus}
          shift={shift?.is_active ? shift : DEFAULT_SHIFT}
          today={today}
          mapHref={childHref("/parent/campuses", params.child === child.id ? child.id : undefined)}
        />
      )}

      <LessonDiary report={report} today={today} />

      <Section
        title="Ảnh & video của con"
        icon={Images}
        iconClassName="bg-violet-100 text-violet-600"
        aside={report && report.media.length > 0 ? `${relativeDayLabel(report.date, today)} · ${report.media.length}` : undefined}
      >
        {report && report.media.length > 0 ? (
          <MediaGallery items={report.media} />
        ) : (
          <EmptyState emoji="📸" title="Chưa có ảnh hoạt động" description="Ảnh và video ở lớp sẽ xuất hiện tại đây." />
        )}
      </Section>
    </div>
  );
}
