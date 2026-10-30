import "server-only";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { addDays, startOfMonth } from "@/lib/date";
import { isAbsence } from "@/config/constants";
import { getAuthContext } from "@/features/auth/queries";
import { listAttendanceOn } from "@/features/attendance/queries";
import { getTeacherContext } from "@/features/teacher/queries";
import { ClassDatePicker } from "@/features/teacher/components/class-date-picker";
import { NoClasses } from "@/features/teacher/components/no-classes";
import { StarLeaderboard } from "@/features/homework/components/star-leaderboard";
import { monthTitle } from "@/features/progress/components/progress-report";
import type { ScreenSearchParams } from "@/features/teacher/screens/attendance-screen";
import { AWARD_WINDOW_DAYS } from "../constants";
import { pendingRewards } from "../milestones";
import { getBadgeCatalog, getClassAwardsOn, getClassLeaderboard, getMilestones, getRedemptions, getStarTotals } from "../queries";
import { AwardBoard, RewardsDue, type DueReward } from "../components/award-board";

/** Màn tặng sao & huy hiệu sau buổi học — dùng chung /teacher/achievements và /admin/achievements. */
export async function AwardScreen({ params }: { params: ScreenSearchParams }) {
  const [{ today, date, classes, selected: cls }, ctx] = await Promise.all([getTeacherContext(params), getAuthContext()]);
  const isAdmin = ctx?.profile.role === "admin";
  const title = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-xl font-extrabold">Tặng sao & huy hiệu</h1>
        <p className="text-sm text-muted-foreground">Sau mỗi buổi học: chạm sao (1–3) và trao huy hiệu vinh danh — phụ huynh nhận thông báo ngay.</p>
      </div>
      {isAdmin && (
        <Link href="/admin/achievements/settings" className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-border hover:bg-muted">
          <Settings2 className="size-4" /> Huy hiệu & mốc quà
        </Link>
      )}
    </div>
  );

  if (!cls) {
    return (
      <div className="space-y-4">
        {title}
        <NoClasses />
      </div>
    );
  }

  const ids = cls.students.map((s) => s.id);
  const [catalog, milestones, attendance, awards, totals, redemptions, board] = await Promise.all([
    getBadgeCatalog(),
    getMilestones(),
    listAttendanceOn(ids, date),
    getClassAwardsOn(ids, date),
    getStarTotals(ids),
    getRedemptions(ids),
    getClassLeaderboard(cls.campus, cls.className, startOfMonth(date), date),
  ]);

  if (!catalog.available) {
    return (
      <div className="space-y-4">
        {title}
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Góc Thành tích chưa được cài đặt — quản trị viên cần chạy file <code>supabase/apply-achievements.sql</code> trong Supabase SQL Editor.
        </p>
      </div>
    );
  }

  const absent = new Map(attendance.map((a) => [a.student_id, isAbsence(a.status)]));
  const editable = isAdmin || date >= addDays(today, -AWARD_WINDOW_DAYS);
  const rows = cls.students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    avatar_url: s.avatar_url,
    absent: absent.get(s.id) ?? false,
    stars: awards.stars.get(s.id) ?? 0,
    badgeIds: awards.badges.get(s.id) ?? [],
    total: totals.get(s.id)?.total ?? 0,
  }));
  const due: DueReward[] = cls.students.flatMap((s) => {
    const total = totals.get(s.id)?.total ?? 0;
    return pendingRewards(total, milestones, redemptions.get(s.id) ?? new Set()).map((milestone) => ({
      studentId: s.id,
      name: s.full_name,
      avatar_url: s.avatar_url,
      total,
      milestone,
    }));
  });

  return (
    <div className="space-y-4">
      {title}
      <ClassDatePicker classes={classes.map((c) => ({ key: c.key, label: c.label, count: c.students.length }))} classKey={cls.key} date={date} today={today} />
      <RewardsDue items={due} />
      <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-6">
        <AwardBoard
          key={`${cls.key}|${date}`}
          rows={rows}
          badges={catalog.badges}
          date={date}
          editable={editable}
          lockedReason={`Chỉ tặng / sửa sao trong ${AWARD_WINDOW_DAYS} ngày gần nhất — ngày này đã khoá.`}
        />
        <StarLeaderboard
          className="mt-4 lg:sticky lg:top-20 lg:mt-0"
          rows={board}
          from={startOfMonth(date)}
          to={date}
          title={`Bảng vàng ${monthTitle(date)}`}
          emptyText="Chưa có bé nào nhận sao tháng này."
          mineLabel=""
        />
      </div>
    </div>
  );
}
