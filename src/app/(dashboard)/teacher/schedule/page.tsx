import type { Metadata } from "next";
import { addDays, endOfMonth, eachDay, isISODate, startOfMonth, startOfWeek, todayVN } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import { getTeacherSchedule } from "@/features/teaching/queries";
import { PAID_STATUSES, buildOccurrences, effectiveRate } from "@/features/teaching/constants";
import { TeacherSchedule } from "@/features/teaching/components/teacher-schedule";

export const metadata: Metadata = { title: "Lịch dạy" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TeacherSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole("teacher");
  const params = await searchParams;
  const today = todayVN();
  const view = params.view === "month" ? "month" : "week";
  const anchor = isISODate(params.date) ? params.date : today;

  // Tuần: Thứ 2 → CN; tháng: đủ các tuần chứa tháng đó (lưới 7 cột)
  const from = view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const to = view === "week" ? addDays(from, 6) : addDays(startOfWeek(endOfMonth(anchor)), 6);
  const days = eachDay(from, to);
  // Lấy thêm: cả tháng hiện tại (thu nhập) + 30 ngày gần đây (ca chưa kết thúc)
  const monthStart = startOfMonth(today);
  const loadFrom = [from, monthStart, addDays(today, -30)].sort()[0]!;
  const loadTo = [to, today].sort()[1]!;

  const data = await getTeacherSchedule(profile.id, loadFrom, loadTo);
  const occurrences = buildOccurrences(days.includes(today) ? days : [...days, today], data.classes, data.sessions);
  const openSession = data.sessions.find((s) => s.status === "in_progress") ?? null;
  const paid = data.sessions.filter((s) => s.date >= monthStart && s.date <= today && PAID_STATUSES.includes(s.status));
  const rates = paid.map((s) => s.rate ?? effectiveRate(data.rates, profile.id, s.subject));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Lịch dạy</h1>
        <p className="text-sm text-muted-foreground">
          Ca dạy tại CS1 Xa La & CS2 Ngô Thì Nhậm. Bấm “Bắt đầu ca dạy” khi vào lớp và “Kết thúc ca dạy” khi tan lớp.
        </p>
      </div>
      {!data.available && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Chức năng chấm công theo ca đang được nhà trường cập nhật — bạn vẫn xem được lịch dạy.
        </p>
      )}
      {data.classes.length === 0 && (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">
          Bạn chưa được phân công lớp cụ thể nào. Liên hệ quản trị viên để được xếp lớp.
        </p>
      )}
      <TeacherSchedule
        today={today}
        view={view}
        anchor={anchor}
        days={days}
        occurrences={occurrences.filter((o) => days.includes(o.date) || o.date === today)}
        classes={[...data.classes, ...data.otherClasses]}
        pickable={[...data.classes, ...data.otherClasses]}
        openSession={openSession}
        income={{
          month: today.slice(0, 7),
          sessions: paid.length,
          amount: rates.reduce<number>((sum, r) => sum + (r ?? 0), 0),
          missingRate: rates.some((r) => r === null),
        }}
      />
    </div>
  );
}
