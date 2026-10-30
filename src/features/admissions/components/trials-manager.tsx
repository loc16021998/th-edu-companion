"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus, CalendarX2, ClipboardCheck, GraduationCap, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { CAMPUS_LABELS } from "@/config/constants";
import { ageFrom } from "@/lib/date";
import { cn } from "@/lib/utils";
import { setTrialStatus } from "../actions";
import { TRIAL_STATUS, localPhone, programLabel, trialConfirmationText, trialWhen, type TrialStatus } from "../constants";
import type { Trial } from "../queries";
import { TrialAssessmentForm, TrialAssessmentSummary } from "./trial-assessment";
import { TrialConfirmation } from "./trial-confirmation";
import { TrialForm, type ClassOption, type LeadOption, type TeacherOption } from "./trial-form";

type Dialog = { kind: "book" } | { kind: "reschedule"; trial: Trial } | { kind: "assess"; trial: Trial } | null;

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
});

function TrialCard({ trial, now, today, onDialog }: { trial: Trial; now: number; today: string; onDialog: (d: Dialog) => void }) {
  const [pending, startTransition] = useTransition();
  const lead = trial.lead;
  const st = TRIAL_STATUS[trial.status as TrialStatus] ?? TRIAL_STATUS.scheduled;
  const past = new Date(trial.scheduled_at).getTime() < now;
  const scheduled = trial.status === "scheduled";

  const changeStatus = (status: "no_show" | "cancelled") =>
    startTransition(async () => {
      if (
        status === "cancelled" &&
        !(await confirmSheet({
          title: `Huỷ lịch học thử của bé ${lead?.full_name ?? ""}?`,
          confirmLabel: "Huỷ lịch",
          tone: "danger",
        }))
      )
        return;
      const res = await setTrialStatus(trial.id, status);
      if (res.ok) toast.success(status === "cancelled" ? "Đã huỷ lịch học thử" : "Đã ghi nhận bé không đến");
      else toast.error("Chưa lưu được", res.error);
    });

  if (!lead) return null;
  return (
    <li
      id={`t-${trial.id}`}
      className={cn("scroll-mt-24 space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", scheduled && past && "ring-2 ring-amber-300")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-bold">
            {lead.full_name}
            {lead.dob && <span className="font-medium text-muted-foreground"> · {ageFrom(lead.dob, today)} tuổi</span>}
          </p>
          <p className="text-sm font-semibold text-primary">{trialWhen(trial.scheduled_at)}</p>
          <p className="text-xs text-muted-foreground">
            {programLabel(trial.program)} · {CAMPUS_LABELS[trial.campus]}
            {trial.class && ` · Lớp ${trial.class.name}`} · {trial.duration_minutes} phút ·{" "}
            {trial.teacher ? `Cô ${trial.teacher.full_name}` : <span className="font-semibold text-amber-700">chưa phân công giáo viên</span>}
          </p>
          <a href={`tel:${localPhone(lead.phone)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Phone className="size-3" /> PH {lead.parent_name} · {localPhone(lead.phone)}
          </a>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st.badge)}>{st.label}</span>
      </div>

      {scheduled && !past && (
        <TrialConfirmation
          trialId={trial.id}
          phone={lead.phone}
          status={trial.confirmation_status}
          text={trialConfirmationText({
            parentName: lead.parent_name,
            childName: lead.full_name,
            program: trial.program,
            scheduledAt: trial.scheduled_at,
            campus: trial.campus,
            className: trial.class?.name,
          })}
        />
      )}
      <TrialAssessmentSummary trial={trial} />

      <div className="flex flex-wrap gap-2">
        {trial.status === "completed" && !lead.converted_student_id && (
          <Button asChild size="sm" className="min-h-9 rounded-lg bg-emerald-600 hover:bg-emerald-600/90">
            <Link href={`/admin/admissions?${new URLSearchParams({ lead: lead.id, view: "convert" })}`}>
              <GraduationCap /> Chốt khoá học
            </Link>
          </Button>
        )}
        {lead.converted_student_id && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
            <GraduationCap className="size-4" /> Đã nhập học
          </span>
        )}
        {scheduled && (
          <>
            {past && (
              <Button type="button" size="sm" className="min-h-9 rounded-lg" onClick={() => onDialog({ kind: "assess", trial })}>
                <ClipboardCheck /> Nhập đánh giá
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={() => onDialog({ kind: "reschedule", trial })}>
              <Pencil /> Đổi lịch
            </Button>
            {past && (
              <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-lg" disabled={pending} onClick={() => changeStatus("no_show")}>
                Bé không đến
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-9 rounded-lg text-destructive"
              disabled={pending}
              onClick={() => changeStatus("cancelled")}
            >
              <CalendarX2 /> Huỷ
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function Group({ title, hint, items, ...rest }: { title: string; hint?: string; items: Trial[]; now: number; today: string; onDialog: (d: Dialog) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-base font-bold">
        {title} <span className="text-sm font-semibold text-muted-foreground tabular-nums">({items.length})</span>
      </h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((t) => (
          <TrialCard key={t.id} trial={t} {...rest} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Lịch lớp học trải nghiệm: chờ đánh giá → hôm nay → sắp tới → đã học gần đây.
 * `now` từ server để nhóm giống nhau khi render server / client.
 */
export function TrialsManager({
  trials,
  leads,
  classes,
  teachers,
  now,
  today,
}: {
  trials: Trial[];
  leads: LeadOption[];
  classes: ClassOption[];
  teachers: TeacherOption[];
  now: number;
  today: string;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const close = () => setDialog(null);

  const isToday = (t: Trial) => dayKey.format(new Date(t.scheduled_at)) === today;
  const waiting = trials.filter((t) => t.status === "scheduled" && new Date(t.scheduled_at).getTime() < now);
  const todayList = trials.filter((t) => t.status === "scheduled" && isToday(t) && new Date(t.scheduled_at).getTime() >= now);
  const upcoming = trials.filter((t) => t.status === "scheduled" && !isToday(t) && new Date(t.scheduled_at).getTime() >= now);
  const done = trials.filter((t) => t.status === "completed" || t.status === "no_show").reverse();
  const cancelled = trials.filter((t) => t.status === "cancelled").reverse();
  const shared = { now, today, onDialog: setDialog };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {todayList.length + upcoming.length} buổi sắp tới · {waiting.length} chờ đánh giá
        </p>
        <Button type="button" className="h-11 rounded-xl" onClick={() => setDialog({ kind: "book" })} disabled={leads.length === 0}>
          <CalendarPlus /> Xếp lịch học thử
        </Button>
      </div>

      {trials.length === 0 && (
        <p className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">
          Chưa có lịch học thử nào. {leads.length === 0 ? "Thêm học sinh tiềm năng ở mục Danh sách trước." : "Bấm “Xếp lịch học thử” để hẹn buổi đầu tiên."}
        </p>
      )}

      <Group title="Chờ đánh giá" hint="Đã qua giờ học — giáo viên đánh giá trên app, hoặc tư vấn viên nhập thay." items={waiting} {...shared} />
      <Group title="Hôm nay" items={todayList} {...shared} />
      <Group title="Sắp tới" items={upcoming} {...shared} />
      <Group title="Đã học thử (60 ngày)" items={done} {...shared} />
      {cancelled.length > 0 && (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-9 rounded-lg" onClick={() => setShowCancelled((v) => !v)}>
            {showCancelled ? "Ẩn" : "Xem"} {cancelled.length} lịch đã huỷ
          </Button>
          {showCancelled && <Group title="Đã huỷ" items={cancelled} {...shared} />}
        </div>
      )}

      <Sheet open={!!dialog} onOpenChange={(o) => !o && close()}>
        <SheetContent className="sm:max-w-xl">
          {dialog && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {dialog.kind === "book"
                    ? "Xếp lịch học thử"
                    : dialog.kind === "reschedule"
                      ? `Đổi lịch · bé ${dialog.trial.lead?.full_name}`
                      : `Đánh giá · bé ${dialog.trial.lead?.full_name}`}
                </SheetTitle>
                <SheetDescription>
                  {dialog.kind === "assess" ? "Nhập thay giáo viên khi cô gửi đánh giá qua tin nhắn." : "Giáo viên được phân công nhận thông báo ngay."}
                </SheetDescription>
              </SheetHeader>
              {dialog.kind === "book" && <TrialForm leads={leads} classes={classes} teachers={teachers} onDone={close} />}
              {dialog.kind === "reschedule" && dialog.trial.lead && (
                <TrialForm
                  lead={{ ...dialog.trial.lead, campus: dialog.trial.campus }}
                  trial={dialog.trial}
                  classes={classes}
                  teachers={teachers}
                  onDone={close}
                />
              )}
              {dialog.kind === "assess" && <TrialAssessmentForm trial={dialog.trial} onDone={close} />}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
