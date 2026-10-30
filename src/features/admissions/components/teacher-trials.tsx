"use client";

import { useState } from "react";
import { CalendarHeart, ClipboardCheck, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CAMPUS_LABELS } from "@/config/constants";
import { ageFrom } from "@/lib/date";
import { cn } from "@/lib/utils";
import { TRIAL_STATUS, programLabel, trialWhen, type TrialStatus } from "../constants";
import type { TeacherTrial } from "../queries";
import { TrialAssessmentForm, TrialAssessmentSummary } from "./trial-assessment";

/** Mở form đánh giá từ 30 phút trước giờ học (khớp kiểm tra trong submit_trial_assessment). */
const OPEN_BEFORE_MS = 30 * 60_000;

function TrialRow({ trial, now, today, onAssess }: { trial: TeacherTrial; now: number; today: string; onAssess: () => void }) {
  const st = TRIAL_STATUS[trial.status as TrialStatus] ?? TRIAL_STATUS.scheduled;
  const canAssess = trial.status !== "no_show" && new Date(trial.scheduled_at).getTime() - OPEN_BEFORE_MS <= now;
  const needs = trial.status === "scheduled" && canAssess;
  return (
    <li id={`t-${trial.id}`} className={cn("scroll-mt-24 space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", needs && "ring-2 ring-amber-300")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-bold">
            Bé {trial.child_name}
            {trial.child_dob && <span className="font-medium text-muted-foreground"> · {ageFrom(trial.child_dob, today)} tuổi</span>}
          </p>
          <p className="text-sm font-semibold text-primary">{trialWhen(trial.scheduled_at)}</p>
          <p className="text-xs text-muted-foreground">
            {programLabel(trial.program)} · {CAMPUS_LABELS[trial.campus]}
            {trial.class_name && ` · Lớp ${trial.class_name}`} · {trial.duration_minutes} phút
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st.badge)}>{st.label}</span>
      </div>
      {trial.note_for_teacher && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-950 ring-1 ring-amber-200">
          <StickyNote className="mt-0.5 size-4 shrink-0" /> <span className="break-words">{trial.note_for_teacher}</span>
        </p>
      )}
      <TrialAssessmentSummary trial={trial} />
      {canAssess && (
        <Button type="button" className="h-11 w-full rounded-xl sm:w-auto" variant={needs ? "default" : "outline"} onClick={onAssess}>
          <ClipboardCheck /> {trial.status === "completed" ? "Sửa đánh giá" : "Đánh giá nhanh"}
        </Button>
      )}
    </li>
  );
}

/** Giáo viên: buổi học thử được phân công + đánh giá năng lực ban đầu ngay trên app. */
export function TeacherTrials({ trials, now, today }: { trials: TeacherTrial[]; now: number; today: string }) {
  const [assessId, setAssessId] = useState<string | null>(null);
  const assessing = trials.find((t) => t.id === assessId);

  const pending = trials.filter((t) => t.status === "scheduled").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const done = trials.filter((t) => t.status !== "scheduled");

  if (trials.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
        <CalendarHeart className="size-8 text-muted-foreground" />
        <p className="font-semibold">Chưa có buổi học thử nào</p>
        <p className="text-sm text-muted-foreground">Khi tư vấn viên xếp bé học thử với cô, lịch sẽ hiện ở đây kèm thông báo 🔔.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Sắp học / chờ đánh giá</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((t) => (
              <TrialRow key={t.id} trial={t} now={now} today={today} onAssess={() => setAssessId(t.id)} />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Đã học thử</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {done.map((t) => (
              <TrialRow key={t.id} trial={t} now={now} today={today} onAssess={() => setAssessId(t.id)} />
            ))}
          </ul>
        </section>
      )}

      <Sheet open={!!assessing} onOpenChange={(o) => !o && setAssessId(null)}>
        <SheetContent className="sm:max-w-xl">
          {assessing && (
            <>
              <SheetHeader>
                <SheetTitle>Đánh giá nhanh · bé {assessing.child_name}</SheetTitle>
                <SheetDescription>Tư vấn viên dùng đánh giá này để tư vấn lộ trình cho phụ huynh.</SheetDescription>
              </SheetHeader>
              <TrialAssessmentForm trial={assessing} onDone={() => setAssessId(null)} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
