"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, GraduationCap, Loader2, Pencil, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { fieldClass } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { CAMPUS_LABELS } from "@/config/constants";
import { ageFrom, fullDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { deleteLead, setLeadStatus, setTrialStatus } from "../actions";
import {
  LEAD_SOURCES,
  LEAD_STATUS,
  TRIAL_STATUS,
  localPhone,
  programLabel,
  trialConfirmationText,
  trialWhen,
  type LeadSource,
  type LeadStatus,
  type TrialStatus,
} from "../constants";
import type { Lead, LeadTrial } from "../queries";
import { ConvertLeadForm, type FeeClassOption } from "./convert-lead-form";
import { LeadForm, type PersonOption } from "./lead-form";
import { TrialAssessmentForm, TrialAssessmentSummary } from "./trial-assessment";
import { TrialConfirmation } from "./trial-confirmation";
import { TrialForm, type TeacherOption } from "./trial-form";

export type LeadView = "overview" | "edit" | "book" | "convert" | { reschedule: string } | { assess: string };

const SELECTABLE: LeadStatus[] = ["new", "contacted", "trial_booked", "lost"];

export function LeadStatusBadge({ status }: { status: string }) {
  const s = LEAD_STATUS[status as LeadStatus] ?? LEAD_STATUS.new;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ring-1", s.badge)}>{s.label}</span>;
}

function TrialItem({ lead, trial, onView }: { lead: Lead; trial: LeadTrial; onView: (v: LeadView) => void }) {
  const [pending, startTransition] = useTransition();
  const st = TRIAL_STATUS[trial.status as TrialStatus] ?? TRIAL_STATUS.scheduled;
  const past = new Date(trial.scheduled_at).getTime() < Date.now();

  const changeStatus = (status: "no_show" | "cancelled") =>
    startTransition(async () => {
      if (
        status === "cancelled" &&
        !(await confirmSheet({
          title: "Huỷ buổi học thử này?",
          confirmLabel: "Huỷ lịch",
          tone: "danger",
        }))
      )
        return;
      const res = await setTrialStatus(trial.id, status);
      if (res.ok) toast.success(status === "cancelled" ? "Đã huỷ lịch học thử" : "Đã ghi nhận bé không đến");
      else toast.error("Chưa lưu được", res.error);
    });

  return (
    <li id={`t-${trial.id}`} className="space-y-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{trialWhen(trial.scheduled_at)}</p>
          <p className="text-xs text-muted-foreground">
            {programLabel(trial.program)} · {CAMPUS_LABELS[trial.campus]}
            {trial.class && ` · Lớp ${trial.class.name}`} · {trial.duration_minutes} phút
            {trial.teacher && ` · Cô ${trial.teacher.full_name}`}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st.badge)}>{st.label}</span>
      </div>

      {trial.status === "scheduled" && (
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
      {trial.status === "scheduled" && past && !trial.assessment_level && (
        <p className="rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900 ring-1 ring-amber-200">Đã qua giờ học thử — đang chờ giáo viên đánh giá.</p>
      )}

      {trial.status === "scheduled" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={() => onView({ reschedule: trial.id })}>
            <Pencil /> Đổi lịch
          </Button>
          {past && (
            <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={() => onView({ assess: trial.id })}>
              Nhập đánh giá thay cô
            </Button>
          )}
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
            Huỷ lịch
          </Button>
        </div>
      )}
    </li>
  );
}

/** Nội dung sheet chi tiết 1 học sinh tiềm năng: liên hệ, trạng thái, lịch học thử, chuyển thành học viên. */
export function LeadDetail({
  lead,
  view,
  onView,
  onClose,
  today,
  classes,
  teachers,
  consultants,
}: {
  lead: Lead;
  view: LeadView;
  onView: (v: LeadView) => void;
  onClose: () => void;
  today: string;
  classes: FeeClassOption[];
  teachers: TeacherOption[];
  consultants: PersonOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState(lead.lost_reason ?? "");
  const enrolled = lead.status === "enrolled" || !!lead.converted_student_id;
  const local = localPhone(lead.phone);
  const hasAssessment = lead.trials.some((t) => t.assessment_level);

  const changeStatus = (status: LeadStatus, reason?: string) =>
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, status, reason);
      if (res.ok) {
        toast.success(`Đã chuyển sang “${LEAD_STATUS[status].label}”`);
        setLostOpen(false);
      } else toast.error("Chưa đổi được trạng thái", res.error);
    });

  const remove = () =>
    startTransition(async () => {
      if (
        !(await confirmSheet({
          title: `Xoá bé ${lead.full_name}?`,
          description: "Xoá cả lịch học thử và đánh giá. Không hoàn tác được.",
          confirmLabel: "Xoá",
          tone: "danger",
        }))
      )
        return;
      const res = await deleteLead(lead.id);
      if (res.ok) {
        toast.success("Đã xoá khỏi danh sách tuyển sinh");
        onClose();
      } else toast.error("Chưa xoá được", res.error);
    });

  const back = (
    <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2 min-h-9 rounded-lg" onClick={() => onView("overview")}>
      <ArrowLeft /> Quay lại
    </Button>
  );

  const campusClasses = classes;
  const leadOption = {
    id: lead.id,
    full_name: lead.full_name,
    parent_name: lead.parent_name,
    campus: lead.campus,
    target_program: lead.target_program,
  };

  if (view === "edit") {
    return (
      <div>
        {back}
        <LeadForm lead={lead} consultants={consultants} onDone={() => onView("overview")} />
      </div>
    );
  }
  if (view === "book") {
    return (
      <div>
        {back}
        <TrialForm lead={leadOption} classes={campusClasses} teachers={teachers} onDone={() => onView("overview")} />
      </div>
    );
  }
  if (view === "convert") {
    return (
      <div>
        {back}
        <ConvertLeadForm lead={lead} classes={classes} onDone={onClose} />
      </div>
    );
  }
  if (typeof view === "object") {
    const trial = lead.trials.find((t) => t.id === ("reschedule" in view ? view.reschedule : view.assess));
    if (!trial) return back;
    return (
      <div>
        {back}
        {"reschedule" in view ? (
          <TrialForm lead={leadOption} trial={trial} classes={campusClasses} teachers={teachers} onDone={() => onView("overview")} />
        ) : (
          <TrialAssessmentForm trial={trial} onDone={() => onView("overview")} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="min-h-10 rounded-xl">
          <a href={`tel:${local}`}>
            <Phone /> Gọi {local}
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-10 rounded-xl">
          <a href={`https://zalo.me/${local}`} target="_blank" rel="noopener noreferrer">
            Nhắn Zalo
          </a>
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10 rounded-xl" onClick={() => onView("edit")}>
          <Pencil /> Sửa thông tin
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-muted/50 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Phụ huynh</dt>
          <dd className="font-semibold">{lead.parent_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Chương trình</dt>
          <dd className="font-semibold">{programLabel(lead.target_program)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cơ sở</dt>
          <dd className="font-semibold">{CAMPUS_LABELS[lead.campus]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Nguồn</dt>
          <dd className="font-semibold">{LEAD_SOURCES[lead.source as LeadSource] ?? lead.source}</dd>
        </div>
        {lead.dob && (
          <div>
            <dt className="text-xs text-muted-foreground">Ngày sinh</dt>
            <dd className="font-semibold">
              {fullDate(lead.dob)} ({ageFrom(lead.dob, today)} tuổi)
            </dd>
          </div>
        )}
        {lead.follow_up_on && (
          <div>
            <dt className="text-xs text-muted-foreground">Hẹn gọi lại</dt>
            <dd className={cn("font-semibold", lead.follow_up_on <= today && !enrolled && "text-rose-600")}>{fullDate(lead.follow_up_on)}</dd>
          </div>
        )}
        {lead.assignee && (
          <div>
            <dt className="text-xs text-muted-foreground">Tư vấn viên</dt>
            <dd className="font-semibold">{lead.assignee.full_name}</dd>
          </div>
        )}
        {lead.notes && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Ghi chú tư vấn</dt>
            <dd className="whitespace-pre-wrap break-words">{lead.notes}</dd>
          </div>
        )}
      </dl>

      {enrolled ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <GraduationCap className="size-5" /> Đã là học viên chính thức
            {lead.converted_at && ` từ ${fullDate(lead.converted_at.slice(0, 10))}`}
          </p>
          <Button asChild size="sm" variant="outline" className="min-h-9 rounded-lg">
            <Link href="/admin/students">Xem trang Học sinh</Link>
          </Button>
        </div>
      ) : (
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Trạng thái tư vấn</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SELECTABLE.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                aria-pressed={lead.status === s}
                onClick={() => (s === "lost" ? setLostOpen(true) : s !== lead.status && changeStatus(s))}
                className={cn(
                  "tap flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ring-1 transition-colors",
                  lead.status === s ? "bg-foreground text-background ring-foreground" : "bg-card ring-border",
                )}
              >
                <span className={cn("size-2 rounded-full", LEAD_STATUS[s].dot)} aria-hidden />
                {LEAD_STATUS[s].label}
              </button>
            ))}
          </div>
          {(lostOpen || lead.status === "lost") && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <label htmlFor="lost-reason" className="text-xs font-semibold text-muted-foreground">
                Lý do không theo học
              </label>
              <input
                id="lost-reason"
                value={lostReason}
                maxLength={300}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="Vd: nhà xa, học phí, đã chọn trung tâm khác…"
                className={fieldClass}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 rounded-lg"
                disabled={pending}
                onClick={() => changeStatus("lost", lostReason)}
              >
                {pending && <Loader2 className="animate-spin" />} Lưu “Không theo học”
              </Button>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Lớp học trải nghiệm</h3>
          {!enrolled && (
            <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={() => onView("book")}>
              <CalendarPlus /> Xếp lịch học thử
            </Button>
          )}
        </div>
        {lead.trials.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Chưa có lịch học thử.</p>
        ) : (
          <ul className="space-y-3">
            {lead.trials.map((t) => (
              <TrialItem key={t.id} lead={lead} trial={t} onView={onView} />
            ))}
          </ul>
        )}
      </section>

      {!enrolled && (
        <Button
          type="button"
          className={cn("h-12 w-full rounded-xl text-base", hasAssessment ? "bg-emerald-600 hover:bg-emerald-600/90" : "")}
          variant={hasAssessment ? "default" : "outline"}
          onClick={() => onView("convert")}
        >
          <GraduationCap /> Chuyển thành học viên chính thức
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" className="min-h-9 w-full rounded-lg text-destructive" disabled={pending} onClick={remove}>
        <Trash2 /> Xoá khỏi danh sách
      </Button>
    </div>
  );
}
