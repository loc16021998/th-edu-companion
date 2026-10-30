"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, CircleCheck, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldClass } from "@/components/shared/form-field";
import { addDays, dayMonth, eachDay, weekdayLong } from "@/lib/date";
import { cn } from "@/lib/utils";
import { cancelLeaveRequest, createLeaveRequest } from "../actions";
import { LEAVE_BACKDATE_DAYS, LEAVE_REASONS, LEAVE_REASON_KEYS, LEAVE_STATUS, type LeaveReason } from "../constants";
import type { LeaveRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";

/** Số buổi học (Thứ 2 – Thứ 7) trong khoảng ngày. */
function schoolDays(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  return eachDay(from, to).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0).length;
}

export function rangeLabel(from: string, to: string) {
  return from === to ? `${weekdayLong(from)}, ${dayMonth(from)}` : `${dayMonth(from)} – ${dayMonth(to)}`;
}

export function LeaveRequestForm({ studentId, childName, today }: { studentId: string; childName: string; today: string }) {
  const router = useRouter();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState<LeaveReason>("sick");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sessions = schoolDays(start, end);

  function quick(days: number) {
    const d = addDays(today, days);
    setStart(d);
    setEnd(d);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (sessions === 0) return setResult({ ok: false, text: "Khoảng ngày đã chọn không có buổi học nào (Chủ nhật nghỉ)." });
    startTransition(async () => {
      const res = await createLeaveRequest({ studentId, startDate: start, endDate: end, reason, note });
      if (!res.ok) {
        toast.error("Chưa gửi được đơn", res.error);
        return setResult({ ok: false, text: res.error });
      }
      toast.success(`Đã gửi đơn xin nghỉ cho ${childName} 📨`, "Cô sẽ xác nhận sớm — bố mẹ nhận thông báo ngay khi cô trả lời.");
      setResult({ ok: true, text: `Đã gửi đơn xin nghỉ cho ${childName}. Cô sẽ xác nhận sớm — bố mẹ nhận thông báo ngay khi cô trả lời.` });
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="flex items-center gap-2 font-bold">
        <CalendarDays className="size-5 text-primary" /> Gửi đơn xin nghỉ cho {childName}
      </h2>

      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "Hôm nay", days: 0 },
          { label: "Ngày mai", days: 1 },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => quick(q.days)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold ring-1",
              start === addDays(today, q.days) && end === start ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nghỉ từ ngày" htmlFor="lv-start">
          <input
            id="lv-start"
            type="date"
            value={start}
            min={addDays(today, -LEAVE_BACKDATE_DAYS)}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > end) setEnd(e.target.value);
            }}
            className={fieldClass}
            required
          />
        </Field>
        <Field label="Đến hết ngày" htmlFor="lv-end">
          <input id="lv-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={fieldClass} required />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {sessions > 0 ? `${rangeLabel(start, end)} · ${sessions} buổi học` : "Không có buổi học nào trong khoảng này (Chủ nhật nghỉ)."}
      </p>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Lý do</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {LEAVE_REASON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={reason === k}
              onClick={() => setReason(k)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ring-1 transition-colors",
                reason === k ? "bg-primary/10 text-primary ring-primary" : "bg-card ring-border hover:bg-muted",
              )}
            >
              <span aria-hidden>{LEAVE_REASONS[k].emoji}</span> {LEAVE_REASONS[k].label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={reason === "other" ? "Lý do cụ thể" : "Lời nhắn cho cô (không bắt buộc)"} htmlFor="lv-note">
        <Textarea
          id="lv-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={reason === "sick" ? "VD: Con bị sốt nhẹ, gia đình cho con nghỉ ở nhà." : "Bố mẹ nhắn thêm cho cô…"}
          className="rounded-xl text-base md:text-sm"
        />
      </Field>

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={cn(
            "flex items-start gap-2 rounded-xl p-3 text-sm font-medium",
            result.ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
          )}
        >
          {result.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          {result.text}
        </p>
      )}
      <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Send />} Gửi đơn cho cô
      </Button>
    </form>
  );
}

export function ParentLeaveList({ items }: { items: LeaveRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function cancel(id: string) {
    if (!(await confirmSheet({ title: "Huỷ đơn xin nghỉ này?", description: "Cô sẽ không nhận được đơn nữa.", confirmLabel: "Huỷ đơn", cancelLabel: "Giữ đơn", tone: "danger" }))) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await cancelLeaveRequest(id);
      setPendingId(null);
      if (!res.ok) {
        toast.error("Chưa huỷ được đơn", res.error);
        return setError(res.error);
      }
      toast.success("Đã huỷ đơn xin nghỉ");
      router.refresh();
    });
  }

  if (items.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Chưa có đơn xin nghỉ nào.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="space-y-1.5 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{rangeLabel(r.startDate, r.endDate)}</p>
                <p className="text-sm text-muted-foreground">
                  {LEAVE_REASONS[r.reason]?.emoji} {LEAVE_REASONS[r.reason]?.label ?? r.reason}
                  {r.note && ` · ${r.note}`}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", LEAVE_STATUS[r.status].badge)}>{LEAVE_STATUS[r.status].label}</span>
            </div>
            {r.decisionNote && <p className="rounded-xl bg-muted/60 p-2.5 text-sm">💬 Cô nhắn: {r.decisionNote}</p>}
            {r.status === "approved" && <p className="text-xs text-emerald-700">Đã ghi nhận “Nghỉ có phép” vào điểm danh — không tính là vắng không phép.</p>}
            {r.status === "pending" && (
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-muted-foreground" onClick={() => cancel(r.id)} disabled={pendingId === r.id}>
                {pendingId === r.id ? <Loader2 className="animate-spin" /> : <X />} Huỷ đơn
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
