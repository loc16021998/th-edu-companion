"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, CalendarClock, ClipboardCheck, Columns3, Inbox, Phone, Plus, Search, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fieldClass } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { CAMPUS_LABELS, SUBJECTS, type SubjectKey } from "@/config/constants";
import { ageFrom, dayMonth } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { setLeadStatus } from "../actions";
import { ASSESSMENT_LEVELS, LEAD_STATUS, LEAD_STATUSES, localPhone, programLabel, trialWhenShort, type AssessmentLevel, type LeadStatus } from "../constants";
import type { Lead } from "../queries";
import type { FeeClassOption } from "./convert-lead-form";
import { LeadDetail, LeadStatusBadge, type LeadView } from "./lead-detail";
import { LeadForm, type PersonOption } from "./lead-form";
import type { TeacherOption } from "./trial-form";

const VIEW_KEY = "th-edu:admissions-view";
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
});
const PROGRAM_TONE: Record<string, string> = {
  tien_tieu_hoc: "bg-sky-50 text-sky-700",
  luyen_chu: "bg-edu-leaf-50 text-edu-leaf-700",
  toan_tu_duy: "bg-edu-peach-50 text-edu-peach-800",
};

/** Buổi học thử sắp tới (gần nhất) hoặc mới nhất, + mức đánh giá nếu có. */
function trialSummary(lead: Lead) {
  const upcoming = [...lead.trials].reverse().find((t) => t.status === "scheduled");
  const assessed = lead.trials.find((t) => t.assessment_level);
  return {
    upcoming,
    level: assessed?.assessment_level ? ASSESSMENT_LEVELS[assessed.assessment_level as AssessmentLevel] : null,
  };
}

function LeadCard({ lead, today, onOpen, draggable }: { lead: Lead; today: string; onOpen: () => void; draggable: boolean }) {
  const { upcoming, level } = trialSummary(lead);
  // Ngày học thử đã qua mà chưa có đánh giá → nhắc chờ giáo viên đánh giá
  const awaiting = upcoming && dayKey.format(new Date(upcoming.scheduled_at)) < today;
  const followUpDue = lead.follow_up_on && lead.follow_up_on <= today && lead.status !== "enrolled" && lead.status !== "lost";
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn("rounded-2xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <button type="button" onClick={onOpen} className="tap block w-full space-y-2 p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold leading-snug">
            {lead.full_name}
            {lead.dob && <span className="font-medium text-muted-foreground"> · {ageFrom(lead.dob, today)} tuổi</span>}
          </p>
          {level && (
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ring-1", level.tone)} title={`Đánh giá: ${level.label}`}>
              {level.emoji}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="size-3.5 shrink-0" />{" "}
          <span className="break-words">
            {lead.parent_name} · {localPhone(lead.phone)}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PROGRAM_TONE[lead.target_program] ?? "bg-muted")}>
            {programLabel(lead.target_program)}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{lead.campus === "CS1_XALA" ? "CS1" : "CS2"}</span>
        </div>
        {upcoming &&
          (awaiting ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              <ClipboardCheck className="size-3.5 shrink-0" /> Đã học thử — chờ cô đánh giá
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800">
              <CalendarClock className="size-3.5 shrink-0" /> Học thử {trialWhenShort(upcoming.scheduled_at)}
              {upcoming.confirmation_status === "pending" && <span className="text-amber-700">· chưa báo PH</span>}
            </p>
          ))}
        {followUpDue && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
            <BellRing className="size-3.5 shrink-0" /> Hẹn gọi lại {lead.follow_up_on === today ? "hôm nay" : dayMonth(lead.follow_up_on!)}
          </p>
        )}
        {lead.status === "lost" && lead.lost_reason && <p className="text-xs text-muted-foreground">Lý do: {lead.lost_reason}</p>}
      </button>
    </li>
  );
}

/**
 * CRM tuyển sinh: Kanban theo trạng thái tư vấn (kéo thả trên máy tính, chạm thẻ → đổi trạng thái trong chi tiết)
 * hoặc dạng bảng. Lọc theo cơ sở / chương trình / tìm tên – SĐT.
 */
export function AdmissionsBoard({
  leads,
  today,
  classes,
  teachers,
  consultants,
}: {
  leads: Lead[];
  today: string;
  classes: FeeClassOption[];
  teachers: TeacherOption[];
  consultants: PersonOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [layout, setLayout] = useState<"kanban" | "table">("kanban");
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState<"" | Enums<"campus">>("");
  const [program, setProgram] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(searchParams.get("lead"));
  const [view, setView] = useState<LeadView>(searchParams.get("view") === "convert" ? "convert" : "overview");
  const [dropTarget, setDropTarget] = useState<LeadStatus | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, moveOptimistic] = useOptimistic(leads, (state, move: { id: string; status: LeadStatus }) =>
    state.map((l) => (l.id === move.id ? { ...l, status: move.status } : l)),
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "kanban") setLayout(saved);
    } catch {}
  }, []);
  const pickLayout = (v: "kanban" | "table") => {
    setLayout(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return optimistic.filter(
      (l) =>
        (!campus || l.campus === campus) &&
        (!program || l.target_program === program) &&
        (!q ||
          l.full_name.toLowerCase().includes(q) ||
          l.parent_name.toLowerCase().includes(q) ||
          (digits.length >= 3 && localPhone(l.phone).includes(digits))),
    );
  }, [optimistic, query, campus, program]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(LEAD_STATUSES.map((s) => [s, [] as Lead[]])) as Record<LeadStatus, Lead[]>;
    for (const l of filtered) (map[l.status as LeadStatus] ?? map.new).push(l);
    return map;
  }, [filtered]);

  const decided = byStatus.enrolled.length + byStatus.lost.length;
  const conversion = decided ? Math.round((byStatus.enrolled.length / decided) * 100) : null;
  const followUps = filtered.filter((l) => l.follow_up_on && l.follow_up_on <= today && l.status !== "enrolled" && l.status !== "lost").length;
  const openLead = optimistic.find((l) => l.id === openId) ?? null;

  const open = (id: string, v: LeadView = "overview") => {
    setOpenId(id);
    setView(v);
  };
  const close = () => {
    setOpenId(null);
    setView("overview");
    if (searchParams.get("lead")) router.replace("/admin/admissions", { scroll: false });
  };

  const drop = (status: LeadStatus, id: string) => {
    setDropTarget(null);
    const lead = optimistic.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    if (lead.converted_student_id) return toast.info("Bé đã nhập học chính thức");
    if (status === "enrolled") return open(id, "convert");
    if (status === "lost") return open(id);
    startTransition(async () => {
      moveOptimistic({ id, status });
      const res = await setLeadStatus(id, status);
      if (res.ok) toast.success(`${lead.full_name} → ${LEAD_STATUS[status].label}`);
      else toast.error("Chưa đổi được trạng thái", res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Số liệu nhanh */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="text-xs font-semibold text-muted-foreground">Đang tư vấn</p>
          <p className="text-2xl font-extrabold tabular-nums">{byStatus.new.length + byStatus.contacted.length + byStatus.trial_booked.length}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="text-xs font-semibold text-muted-foreground">Hẹn học thử</p>
          <p className="text-2xl font-extrabold tabular-nums text-violet-700">{byStatus.trial_booked.length}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="text-xs font-semibold text-muted-foreground">Tỷ lệ chốt</p>
          <p className="text-2xl font-extrabold tabular-nums text-emerald-700">{conversion === null ? "—" : `${conversion}%`}</p>
        </div>
        <div className={cn("rounded-2xl p-3 shadow-sm ring-1", followUps ? "bg-rose-50 ring-rose-200" : "bg-card ring-border")}>
          <p className="text-xs font-semibold text-muted-foreground">Cần gọi lại</p>
          <p className={cn("text-2xl font-extrabold tabular-nums", followUps && "text-rose-700")}>{followUps}</p>
        </div>
      </div>

      {/* Công cụ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên bé, phụ huynh, SĐT…"
            aria-label="Tìm học sinh tiềm năng"
            className={cn(fieldClass, "pl-9")}
          />
        </div>
        <select
          value={campus}
          onChange={(e) => setCampus(e.target.value as "" | Enums<"campus">)}
          aria-label="Lọc theo cơ sở"
          className={cn(fieldClass, "w-auto flex-1 basis-36")}
        >
          <option value="">Tất cả cơ sở</option>
          {Object.entries(CAMPUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          aria-label="Lọc theo chương trình"
          className={cn(fieldClass, "w-auto flex-1 basis-36")}
        >
          <option value="">Mọi chương trình</option>
          {Object.entries(SUBJECTS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Kiểu hiển thị">
          {(
            [
              ["kanban", Columns3, "Kanban"],
              ["table", Table2, "Bảng"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={layout === v}
              onClick={() => pickLayout(v)}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold",
                layout === v ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <Button type="button" className="h-11 rounded-xl" onClick={() => setAdding(true)}>
          <Plus /> Thêm học sinh
        </Button>
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="font-semibold">Chưa có học sinh tiềm năng nào</p>
          <p className="text-sm text-muted-foreground">Bấm “Thêm học sinh” khi có phụ huynh hỏi về Tiền tiểu học, Luyện chữ đẹp hay Toán tư duy.</p>
        </div>
      ) : layout === "kanban" ? (
        // Điện thoại: vuốt ngang qua từng cột; máy tính: 5 cột, kéo thả thẻ giữa các cột
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {LEAD_STATUSES.map((status) => {
            const meta = LEAD_STATUS[status];
            const items = byStatus[status];
            return (
              <section
                key={status}
                aria-label={meta.label}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("text/lead-id")) return;
                  e.preventDefault();
                  setDropTarget(status);
                }}
                onDragLeave={() => setDropTarget((t) => (t === status ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(status, e.dataTransfer.getData("text/lead-id"));
                }}
                className={cn(
                  "flex w-[82%] shrink-0 snap-start flex-col gap-2 rounded-2xl p-2 ring-1 ring-transparent transition-colors sm:w-72 lg:w-auto",
                  meta.column,
                  dropTarget === status && "ring-2 ring-primary",
                )}
              >
                <header className="flex items-center justify-between gap-2 px-1 pt-1">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <span className={cn("size-2.5 rounded-full", meta.dot)} aria-hidden />
                    {meta.label}
                  </h2>
                  <span className="rounded-full bg-card px-2 text-xs font-bold tabular-nums ring-1 ring-border">{items.length}</span>
                </header>
                <p className="px-1 text-xs text-muted-foreground">{meta.hint}</p>
                <ul className="space-y-2">
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} today={today} onOpen={() => open(l.id)} draggable={!l.converted_student_id} />
                  ))}
                </ul>
                {items.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Trống</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Học sinh</th>
                <th className="px-3 py-2.5">Phụ huynh</th>
                <th className="px-3 py-2.5">Chương trình</th>
                <th className="px-3 py-2.5">Cơ sở</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5">Học thử</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((l) => {
                const { upcoming, level } = trialSummary(l);
                return (
                  <tr key={l.id} onClick={() => open(l.id)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <button type="button" className="text-left font-semibold hover:underline" onClick={() => open(l.id)}>
                        {l.full_name}
                      </button>
                      {l.dob && <span className="block text-xs text-muted-foreground">{ageFrom(l.dob, today)} tuổi</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.parent_name}
                      <a href={`tel:${localPhone(l.phone)}`} onClick={(e) => e.stopPropagation()} className="block text-xs font-semibold text-primary">
                        {localPhone(l.phone)}
                      </a>
                    </td>
                    <td className="px-3 py-2.5">{SUBJECTS[l.target_program as SubjectKey] ?? l.target_program}</td>
                    <td className="px-3 py-2.5">{CAMPUS_LABELS[l.campus]}</td>
                    <td className="px-3 py-2.5">
                      <LeadStatusBadge status={l.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">{upcoming ? trialWhenShort(upcoming.scheduled_at) : level ? `${level.emoji} ${level.label}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Không có học sinh khớp bộ lọc.</p>}
        </div>
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Thêm học sinh tiềm năng</SheetTitle>
            <SheetDescription>Thông tin phụ huynh hỏi qua điện thoại, Facebook, Zalo hoặc đến trực tiếp.</SheetDescription>
          </SheetHeader>
          <LeadForm consultants={consultants} onDone={() => setAdding(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!openLead} onOpenChange={(o) => !o && close()}>
        <SheetContent className="sm:max-w-2xl">
          {openLead && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {openLead.full_name} <LeadStatusBadge status={openLead.status} />
                </SheetTitle>
                <SheetDescription>
                  {programLabel(openLead.target_program)} · {CAMPUS_LABELS[openLead.campus]}
                </SheetDescription>
              </SheetHeader>
              <LeadDetail
                key={openLead.id}
                lead={openLead}
                view={view}
                onView={setView}
                onClose={close}
                today={today}
                classes={classes}
                teachers={teachers}
                consultants={consultants}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
