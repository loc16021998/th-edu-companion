import type { Metadata } from "next";
import { addMonths, isISODate, startOfMonth, todayVN } from "@/lib/date";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { MonthNav } from "@/features/progress/components/progress-report";
import { getChildAchievements } from "@/features/achievements/queries";
import { ChildAchievementsView } from "@/features/achievements/components/child-achievements-view";

export const metadata: Metadata = { title: "Góc Thành tích" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentAchievementsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { students, child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  // Xem lại tối đa 12 tháng gần nhất
  const oldest = addMonths(startOfMonth(today), -11);
  const month = startOfMonth(isISODate(params.month) && params.month <= today && params.month >= oldest ? params.month : today);
  const data = await getChildAchievements(child, month, today);
  const childId = students.length > 1 ? child.id : undefined;
  const hrefForMonth = (m: string) => childHref("/parent/achievements", childId, { month: m === startOfMonth(today) ? undefined : m });

  return (
    <>
      <MarkNotificationsRead types={["achievement"]} studentId={child.id} />
      <ChildAchievementsView
        data={data}
        child={child}
        month={month}
        today={today}
        monthNav={<MonthNav month={month} today={today} hrefFor={hrefForMonth} />}
      />
    </>
  );
}
