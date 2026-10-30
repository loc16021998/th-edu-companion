"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, MapPin, Pencil, Phone, Plus, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { deleteAvailability, saveAvailability } from "../actions";
import { AUDIENCES, AUDIENCE_LABELS, CONSULT_MODES, MODE_LABELS, SLOT_MINUTES, WEEKDAYS, type Audience, type ConsultMode } from "../constants";
import type { AvailabilityWindow } from "../queries";
import { slotCount } from "../time";

const MODE_ICON = { online: Video, in_person: MapPin, phone: Phone } as const;

type Draft = { id?: string; weekday: number; start: string; end: string; slotMinutes: number; mode: ConsultMode; meetingUrl: string; location: string; audience: Audience; active: boolean };

const chip = (on: boolean) => cn("rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-colors", on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted");

/**
 * Khung giờ rảnh hằng tuần của chính mình — hệ thống tự chia thành các ô hẹn.
 * Giáo viên: dành cho phụ huynh lớp mình chủ nhiệm. Quản trị viên (`chooseAudience`): chọn phụ huynh / giáo viên / cả hai.
 */
export function AvailabilityEditor({ windows, chooseAudience = false, description }: { windows: AvailabilityWindow[]; chooseAudience?: boolean; description?: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (d: Draft) =>
    startTransition(async () => {
      const res = await saveAvailability(d);
      if (!res.ok) return toast.error("Chưa lưu được khung giờ", res.error);
      toast.success(d.id ? "Đã cập nhật khung giờ" : "Đã mở khung giờ mới", "Phụ huynh lớp bạn đặt lịch được ngay.");
      setDraft(null);
    });

  const remove = async (w: AvailabilityWindow) => {
    const day = WEEKDAYS.find((d) => d.value === w.weekday)?.label;
    if (!(await confirmSheet({ title: `Xoá khung ${day} ${w.start}–${w.end}?`, description: "Lịch hẹn phụ huynh đã đặt vẫn giữ nguyên.", confirmLabel: "Xoá", tone: "danger" }))) return;
    startTransition(async () => {
      const res = await deleteAvailability(w.id);
      if (!res.ok) toast.error("Chưa xoá được", res.error);
    });
  };

  const toDraft = (w: AvailabilityWindow): Draft => ({
    id: w.id,
    weekday: w.weekday,
    start: w.start,
    end: w.end,
    slotMinutes: w.slotMinutes,
    mode: w.mode,
    meetingUrl: w.meetingUrl ?? "",
    location: w.location ?? "",
    audience: w.audience,
    active: w.active,
  });
  const count = draft ? slotCount(draft.start, draft.end, draft.slotMinutes) : 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarClock className="size-5 text-primary" /> Khung giờ rảnh hằng tuần
          </h2>
          <p className="text-sm text-muted-foreground">{description ?? "Phụ huynh lớp bạn chủ nhiệm chọn 1 ô trong các khung này. Mỗi ô chỉ 1 người đặt."}</p>
        </div>
        <Button size="sm" onClick={() => setDraft({ weekday: 6, start: "16:00", end: "17:30", slotMinutes: 30, mode: "online", meetingUrl: "", location: "", audience: "all", active: true })}>
          <Plus className="size-4" /> Thêm khung giờ
        </Button>
      </div>

      {windows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
          Chưa có khung giờ nào. Ví dụ: <b>Thứ 7, 16:00 – 17:30</b>, mỗi ô 30 phút → phụ huynh có 3 lựa chọn.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {windows.map((w) => {
            const Icon = MODE_ICON[w.mode];
            return (
              <li key={w.id} className={cn("flex items-start gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border", !w.active && "opacity-60")}>
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-xs font-bold leading-none">{WEEKDAYS.find((d) => d.value === w.weekday)?.short}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold tabular-nums">
                    {w.start} – {w.end}
                  </p>
                  <p className="flex items-start gap-1 text-xs text-muted-foreground">
                    <Icon className="mt-px size-3.5 shrink-0" />
                    <span className="min-w-0">
                      {MODE_LABELS[w.mode].short} · {slotCount(w.start, w.end, w.slotMinutes)} ô × {w.slotMinutes} phút
                      {chooseAudience && ` · Cho ${AUDIENCE_LABELS[w.audience].toLowerCase()}`}
                      {!w.active && " · Đang tạm dừng"}
                    </span>
                  </p>
                  {w.mode === "in_person" && w.location && <p className="break-words text-xs text-muted-foreground">{w.location}</p>}
                </div>
                <Button size="icon" variant="ghost" aria-label="Sửa khung giờ" onClick={() => setDraft(toDraft(w))}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Xoá khung giờ" className="text-rose-600" onClick={() => void remove(w)} disabled={pending}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!draft} onOpenChange={(o) => !o && !pending && setDraft(null)}>
        <SheetContent locked={pending}>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save(draft);
              }}
            >
              <SheetHeader>
                <SheetTitle>{draft.id ? "Sửa khung giờ" : "Thêm khung giờ rảnh"}</SheetTitle>
                <SheetDescription>Lặp lại hằng tuần. Phụ huynh đặt trước ít nhất 2 giờ.</SheetDescription>
              </SheetHeader>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Thứ</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button key={d.value} type="button" aria-pressed={draft.weekday === d.value} onClick={() => setDraft({ ...draft, weekday: d.value })} className={chip(draft.weekday === d.value)}>
                      {d.short}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="av-start">Từ</Label>
                  <Input id="av-start" type="time" step={300} min="06:00" max="22:00" required value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="av-end">Đến</Label>
                  <Input id="av-end" type="time" step={300} min="06:00" max="22:00" required value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
                </div>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Mỗi ô hẹn</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SLOT_MINUTES.map((m) => (
                    <button key={m} type="button" aria-pressed={draft.slotMinutes === m} onClick={() => setDraft({ ...draft, slotMinutes: m })} className={chip(draft.slotMinutes === m)}>
                      {m} phút
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{count > 0 ? `→ ${count} ô hẹn mỗi tuần` : "Khung giờ quá ngắn so với 1 ô hẹn"}</p>
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Hình thức</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CONSULT_MODES.map((m) => (
                    <button key={m} type="button" aria-pressed={draft.mode === m} onClick={() => setDraft({ ...draft, mode: m })} className={chip(draft.mode === m)}>
                      {MODE_LABELS[m].emoji} {MODE_LABELS[m].short}
                    </button>
                  ))}
                </div>
              </fieldset>
              {chooseAudience && (
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Dành cho</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {AUDIENCES.map((a) => (
                      <button key={a} type="button" aria-pressed={draft.audience === a} onClick={() => setDraft({ ...draft, audience: a })} className={chip(draft.audience === a)}>
                        {AUDIENCE_LABELS[a]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {draft.mode === "online" && (
                <div className="space-y-1">
                  <Label htmlFor="av-url">Link phòng họp cố định (không bắt buộc)</Label>
                  <Input id="av-url" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={draft.meetingUrl} onChange={(e) => setDraft({ ...draft, meetingUrl: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Để trống → bạn dán link khi xác nhận từng lịch.</p>
                </div>
              )}
              {draft.mode === "in_person" && (
                <div className="space-y-1">
                  <Label htmlFor="av-loc">Địa điểm</Label>
                  <Input id="av-loc" maxLength={160} placeholder="VD: Phòng tiếp phụ huynh, tầng 1 — CS1 Xa La" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-primary" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Đang mở cho phụ huynh đặt (bỏ chọn = tạm dừng)
              </label>
              <Button type="submit" className="w-full" disabled={pending || count === 0}>
                {pending && <Loader2 className="size-4 animate-spin" />} Lưu khung giờ
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
