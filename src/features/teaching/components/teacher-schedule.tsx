"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleDot, DoorOpen, MapPin, TriangleAlert, Users, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addDays, addMonths, dayMonth, fullDate, startOfMonth, weekdayLong, weekdayShort } from "@/lib/date";
import { shiftScheduleLabel } from "@/lib/shifts";
import { cn, formatVND } from "@/lib/utils";
import {
  SESSION_STATUS,
  SUBJECT_TONE,
  campusShort,
  clock,
  minutesBetween,
  monthLabel,
  roomLabel,
  subjectLabel,
  type Occurrence,
  type PaySubject,
  type ScheduleClass,
  type SessionRecord,
  type SessionStatus,
} from "../constants";
import { CheckInPanel } from "./check-in-panel";

export type ScheduleView = "week" | "month";

function StatusIcon({ occ, today, since }: { occ: Occurrence; today: string; since: string }) {
  const s = occ.session?.status;
  if (s === "in_progress") return <CircleDot className="size-3.5 shrink-0 animate-pulse text-sky-600" aria-label="Đang dạy" />;
  if (s === "missed_checkout") return <TriangleAlert className="size-3.5 shrink-0 text-amber-600" aria-label="Quên kết thúc ca" />;
  if (s) return <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-label="Đã dạy" />;
  if (occ.date < today && occ.date >= since) return <TriangleAlert className="size-3.5 shrink-0 text-rose-500" aria-label="Chưa ghi nhận ca" />;
  return null;
}

function OccChip({ occ, today, since, onOpen }: { occ: Occurrence; today: string; since: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "tap w-full space-y-0.5 rounded-xl px-2.5 py-2 text-left ring-1 transition-shadow hover:shadow-sm",
        SUBJECT_TONE[occ.subject as PaySubject] ?? SUBJECT_TONE.tong_hop,
      )}
    >
      <span className="flex items-center justify-between gap-1 text-xs font-bold tabular-nums">
        {occ.start} – {occ.end} <StatusIcon occ={occ} today={today} since={since} />
      </span>
      <span className="block text-sm font-semibold leading-snug">Lớp {occ.className}</span>
      <span className="block text-xs opacity-80">
        {occ.campus === "CS1_XALA" ? "CS1" : "CS2"}
        {occ.room && ` · ${roomLabel(occ.room)}`}
      </span>
    </button>
  );
}

/** Thời khoá biểu cá nhân: ca hôm nay (bắt đầu / kết thúc ca) + lịch tuần / tháng + ước tính thu nhập tháng. */
export function TeacherSchedule({
  today,
  view,
  anchor,
  days,
  occurrences,
  classes,
  pickable,
  openSession,
  income,
}: {
  today: string;
  view: ScheduleView;
  anchor: string;
  days: string[];
  occurrences: Occurrence[];
  classes: ScheduleClass[];
  pickable: ScheduleClass[];
  openSession: SessionRecord | null;
  income: { month: string; sessions: number; amount: number; missingRate: boolean };
}) {
  const [opened, setOpened] = useState<Occurrence | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);

  const prev = view === "week" ? addDays(anchor, -7) : addMonths(startOfMonth(anchor), -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(startOfMonth(anchor), 1);
  const href = (v: ScheduleView, d: string) => `/teacher/schedule?${new URLSearchParams({ view: v, date: d })}`;
  const title = view === "week" ? `Tuần ${dayMonth(days[0]!)} – ${dayMonth(days[6]!)}` : monthLabel(anchor.slice(0, 7));
  const month = anchor.slice(0, 7);
  const selectedDay = picked ?? (days.includes(today) ? today : (days.find((d) => d.startsWith(month) && byDay.has(d)) ?? days[0]!));
  // Ngày đầu tiên có ca được ghi nhận — trước đó chưa dùng chấm công theo ca nên không báo "chưa ghi nhận"
  const since = occurrences.reduce((min, o) => (o.session && o.date < min ? o.date : min), today);
  const openClass = opened ? classes.find((c) => c.id === opened.classId) : undefined;

  return (
    <div className="space-y-6">
      <CheckInPanel today={today} occurrences={occurrences} openSession={openSession} classes={pickable} onOpen={setOpened} />

      <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Thu nhập {monthLabel(income.month).toLowerCase()} (tạm tính)</p>
          <p className="text-lg font-extrabold tabular-nums">
            {formatVND(income.amount)} <span className="text-sm font-semibold text-muted-foreground">· {income.sessions} buổi đã dạy</span>
          </p>
          {income.missingRate && <p className="text-xs text-amber-700">Một số môn chưa có đơn giá — trung tâm sẽ cập nhật.</p>}
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="calendar-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={href(view, prev)} aria-label="Trước" className="tap flex size-10 items-center justify-center rounded-xl bg-card ring-1 ring-border">
              <ChevronLeft className="size-5" />
            </Link>
            <h2 id="calendar-heading" className="min-w-0 px-2 text-base font-bold">
              {title}
            </h2>
            <Link href={href(view, next)} aria-label="Sau" className="tap flex size-10 items-center justify-center rounded-xl bg-card ring-1 ring-border">
              <ChevronRight className="size-5" />
            </Link>
            {!days.includes(today) && (
              <Link href={href(view, today)} className="ml-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary">
                Hôm nay
              </Link>
            )}
          </div>
          <nav className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Kiểu lịch">
            {(["week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={href(v, anchor)}
                aria-current={view === v ? "page" : undefined}
                className={cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {v === "week" ? "Tuần" : "Tháng"}
              </Link>
            ))}
          </nav>
        </div>

        {view === "week" ? (
          <ol className="grid gap-2 lg:grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <li key={d} className={cn("rounded-2xl p-2 ring-1", d === today ? "bg-primary/5 ring-primary/40" : "bg-card ring-border")}>
                  <p className={cn("mb-1.5 flex items-baseline gap-1.5 px-1 text-sm font-bold", d === today && "text-primary")}>
                    {weekdayLong(d)} <span className="text-xs font-semibold text-muted-foreground">{dayMonth(d)}</span>
                  </p>
                  {list.length === 0 ? (
                    <p className="px-1 pb-1 text-xs text-muted-foreground">Không có ca</p>
                  ) : (
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                      {list.map((o) => (
                        <OccChip key={o.key} occ={o} today={today} since={since} onOpen={() => setOpened(o)} />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                const inMonth = d.startsWith(month);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPicked(d)}
                    aria-pressed={selectedDay === d}
                    aria-label={`${weekdayLong(d)} ${fullDate(d)}: ${list.length} ca`}
                    className={cn(
                      "tap flex min-h-14 flex-col items-center gap-1 rounded-xl p-1 ring-1 sm:min-h-20",
                      inMonth ? "bg-card ring-border" : "bg-transparent opacity-50 ring-transparent",
                      d === today && "ring-2 ring-primary",
                      selectedDay === d && "bg-primary/10",
                    )}
                  >
                    <span className={cn("text-sm font-bold tabular-nums", d === today && "text-primary")}>{Number(d.slice(8))}</span>
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {list.slice(0, 3).map((o) => (
                        <span
                          key={o.key}
                          className={cn(
                            "size-2 rounded-full",
                            o.session
                              ? o.session.status === "missed_checkout"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                              : o.date < today && o.date >= since
                                ? "bg-rose-400"
                                : "bg-primary/60",
                          )}
                        />
                      ))}
                      {list.length > 3 && <span className="text-[10px] font-bold leading-none">+{list.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-primary/60" /> Sắp dạy
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Đã dạy
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" /> Quên kết thúc ca
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-rose-400" /> Chưa ghi nhận
              </span>
            </p>
            <div className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
              <p className="text-sm font-bold">
                {weekdayLong(selectedDay)}, {fullDate(selectedDay)}
              </p>
              {(byDay.get(selectedDay) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có ca dạy.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(byDay.get(selectedDay) ?? []).map((o) => (
                    <OccChip key={o.key} occ={o} today={today} since={since} onOpen={() => setOpened(o)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <Sheet open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <SheetContent className="sm:max-w-lg">
          {opened && (
            <>
              <SheetHeader>
                <SheetTitle>
                  Lớp {opened.className} · {subjectLabel(opened.subject)}
                </SheetTitle>
                <SheetDescription>
                  {weekdayShort(opened.date)}, {fullDate(opened.date)} · {opened.start} – {opened.end}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3 text-sm">
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" /> Cơ sở
                    </dt>
                    <dd className="font-semibold">{campusShort(opened.campus)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DoorOpen className="size-3.5" /> Phòng học
                    </dt>
                    <dd className="font-semibold">{opened.room ? roomLabel(opened.room) : "Chưa xếp phòng"}</dd>
                  </div>
                  {openClass && (
                    <div className="col-span-2">
                      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" /> Lịch của lớp
                      </dt>
                      <dd className="font-semibold">
                        {shiftScheduleLabel(openClass.shift)}
                        {!openClass.hasShift && " (mặc định)"}
                      </dd>
                    </div>
                  )}
                </dl>

                {opened.session && (
                  <div className="space-y-1 rounded-2xl bg-card p-3 ring-1 ring-border">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      Chấm công ca
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", SESSION_STATUS[opened.session.status as SessionStatus]?.badge)}>
                        {SESSION_STATUS[opened.session.status as SessionStatus]?.label ?? opened.session.status}
                      </span>
                    </p>
                    <p className="text-sm">
                      Bắt đầu {clock(opened.session.checked_in_at)} · Kết thúc {clock(opened.session.checked_out_at)}
                      {minutesBetween(opened.session.checked_in_at, opened.session.checked_out_at) !== null &&
                        ` · ${minutesBetween(opened.session.checked_in_at, opened.session.checked_out_at)} phút`}
                    </p>
                    {opened.session.note && <p className="text-xs text-muted-foreground">Ghi chú: {opened.session.note}</p>}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <Users className="size-4" /> Học sinh phụ trách ({openClass?.students.length ?? 0})
                  </p>
                  {openClass && openClass.students.length > 0 ? (
                    <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {openClass.students.map((s, i) => (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                          <span className="w-5 text-right text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                          {s.full_name}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">Lớp chưa có học sinh.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
