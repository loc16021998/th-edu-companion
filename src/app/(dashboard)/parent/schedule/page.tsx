import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, MapPin, Moon, School } from "lucide-react";
import { CAMPUS_LABELS } from "@/config/constants";
import { ATTENDANCE_STYLE } from "@/config/ui-styles";
import { addDays, dayMonth, isISODate, startOfWeek, todayVN, weekdayLong, weekdayShort } from "@/lib/date";
import { DEFAULT_SHIFT, hhmm, isShiftDay, nextShiftDate, shiftPhase, shiftScheduleLabel, shiftTimeLabel, type ShiftPhase } from "@/lib/shifts";
import { cn, givenName } from "@/lib/utils";
import { listAttendanceBetween } from "@/features/attendance/queries";
import { cacheEnabled, listChildAttendanceCached } from "@/features/parent/cached";
import { childHref, getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { getClassShift } from "@/features/shifts/queries";

export const metadata: Metadata = { title: "Lịch học" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { students, child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const weekStart = startOfWeek(isISODate(params.week) ? params.week : today);
  const weekEnd = addDays(weekStart, 6);
  const [attendance, classShift] = await Promise.all([
    (cacheEnabled() ? listChildAttendanceCached : listAttendanceBetween)(child.id, weekStart, weekEnd),
    getClassShift(child.campus, child.class_name),
  ]);
  const byDate = new Map(attendance.map((a) => [a.date, a]));

  // Ca học của lớp do quản trị viên gán; chưa gán (hoặc ca tạm ngưng) → lịch mặc định
  const shift = classShift?.is_active ? classShift : DEFAULT_SHIFT;
  const timeLabel = shiftTimeLabel(shift);
  const next = nextShiftDate(today, shift);
  const phase = shiftPhase(today, shift);
  const phaseLabel: Record<ShiftPhase, string> = {
    off: "Hôm nay không có buổi học",
    upcoming: `Bắt đầu lúc ${hhmm(shift.start_time)}`,
    in_progress: `Đang học · kết thúc ${hhmm(shift.end_time)}`,
    finished: "Buổi học hôm nay đã kết thúc",
  };
  const childId = students.length > 1 ? child.id : undefined;
  const weekHref = (start: string) => childHref("/parent/schedule", childId, { week: start === startOfWeek(today) ? undefined : start });
  const thisWeek = weekStart === startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Lịch học của {givenName(child.full_name)}</h1>


      {/* Thông tin lớp + buổi tiếp theo */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-edu-blue-500 via-edu-blue to-edu-blue-800 p-5 text-white shadow-lg shadow-emerald-500/20">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
            <School className="size-3.5" /> Lớp {child.class_name}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
            <MapPin className="size-3.5" /> {CAMPUS_LABELS[child.campus]}
          </span>
        </div>
        <p className="mt-4 text-sm font-medium text-white/85">{next === today ? "Buổi học hôm nay" : "Buổi học tiếp theo"}</p>
        <p className="mt-0.5 text-2xl font-extrabold leading-tight">
          {next === today ? "Hôm nay" : next === addDays(today, 1) ? "Ngày mai" : weekdayLong(next)}, {dayMonth(next)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="size-4" /> {timeLabel}
          {next === today && <span className="font-medium text-white/85">· {phaseLabel[phase]}</span>}
        </p>
        <p className="mt-3 flex items-center gap-1.5 border-t border-white/20 pt-3 text-xs font-medium text-white/85">
          <CalendarClock className="size-4" /> {classShift?.is_active ? `${shift.name}: ` : "Lịch học: "}
          {shiftScheduleLabel(shift)}
        </p>
      </section>

      {/* Lịch theo tuần */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border">
          <Link href={weekHref(addDays(weekStart, -7))} aria-label="Tuần trước" className="flex size-10 items-center justify-center rounded-xl active:bg-accent">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="text-center">
            <p className="font-bold">
              {dayMonth(weekStart)} – {dayMonth(weekEnd)}
            </p>
            {thisWeek ? (
              <p className="text-xs text-muted-foreground">Tuần này</p>
            ) : (
              <Link href={weekHref(startOfWeek(today))} className="text-xs font-semibold text-primary">
                Về tuần này
              </Link>
            )}
          </div>
          <Link href={weekHref(addDays(weekStart, 7))} aria-label="Tuần sau" className="flex size-10 items-center justify-center rounded-xl active:bg-accent">
            <ChevronRight className="size-5" />
          </Link>
        </div>

        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {days.map((day) => {
            const isToday = day === today;
            const att = byDate.get(day);

            if (!isShiftDay(day, shift)) {
              return (
                <li key={day} className="flex items-center gap-3 bg-muted/40 p-3 text-muted-foreground">
                  <DayBadge day={day} isToday={isToday} />
                  <span className="flex flex-1 items-center gap-1.5 text-sm font-medium">
                    <Moon className="size-4" /> Nghỉ
                  </span>
                </li>
              );
            }

            let status: { label: string; className: string };
            if (att) {
              const style = ATTENDANCE_STYLE[att.status];
              status = { label: style.label, className: style.badge };
            } else if (day > today || (isToday && phase === "upcoming")) {
              status = { label: isToday ? `Hôm nay ${hhmm(shift.start_time)}` : "Sắp tới", className: "bg-sky-50 text-sky-700 ring-sky-100" };
            } else if (isToday && phase === "in_progress") {
              status = { label: "Đang học", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
            } else {
              status = { label: "Chưa điểm danh", className: "bg-slate-100 text-slate-600 ring-slate-200" };
            }

            return (
              <li key={day} className={cn("flex items-center gap-3 p-3", isToday && "bg-accent/50")}>
                <DayBadge day={day} isToday={isToday} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{timeLabel}</p>
                  {att?.note && <p className="break-words text-xs text-muted-foreground">{att.note}</p>}
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", status.className)}>{status.label}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-center text-xs text-muted-foreground">
          Lịch có thể thay đổi vào ngày lễ, Tết — trung tâm sẽ thông báo trước.
        </p>
      </section>
    </div>
  );
}

function DayBadge({ day, isToday }: { day: string; isToday: boolean }) {
  return (
    <span
      className={cn(
        "flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5 text-center",
        isToday ? "bg-primary text-primary-foreground" : "bg-muted",
      )}
    >
      <span className="text-xs font-semibold uppercase leading-none opacity-80">{weekdayShort(day)}</span>
      <span className="mt-0.5 text-sm font-extrabold leading-none tabular-nums">{dayMonth(day)}</span>
    </span>
  );
}
