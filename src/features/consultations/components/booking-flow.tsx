"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { weekdayShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import { bookConsultation } from "../actions";
import { MODE_LABELS, modeOf } from "../constants";
import type { BookingHost } from "../queries";
import { groupSlotsByDay, slotLabel, vnTime, type Slot } from "../time";

const hostLabel = (h: BookingHost) => (h.role === "admin" ? `Ban quản lý · ${h.name}` : `${h.name} · Chủ nhiệm`);

/**
 * Đặt lịch: chọn người trao đổi (cô chủ nhiệm / Ban quản lý) → ngày → ô giờ trống → nội dung.
 * Phụ huynh: `studentId` = bé đang xem; giáo viên đặt với Ban quản lý: `studentId` = null.
 * Ô đã có người đặt hiện mờ (không lộ ai đặt). Gửi xong: người chủ trì nhận thông báo để xác nhận.
 */
export function BookingFlow({
  studentId,
  title,
  hosts,
  slots,
  suggestions,
  emptyText,
}: {
  studentId: string | null;
  title: string;
  hosts: BookingHost[];
  slots: Record<string, Slot[]>;
  suggestions: readonly string[];
  /** Không có ai để đặt (chưa có giáo viên chủ nhiệm / Ban quản lý chưa mở khung) */
  emptyText: string;
}) {
  const router = useRouter();
  const bookable = hosts.filter((h) => h.hasAvailability);
  const [hostId, setHostId] = useState(bookable[0]?.id ?? "");
  const days = useMemo(() => groupSlotsByDay(slots[hostId] ?? []), [slots, hostId]);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [topic, setTopic] = useState("");
  const [pending, startTransition] = useTransition();
  const activeDay = days.find((d) => d.date === day) ?? days.find((d) => d.free > 0) ?? null;

  if (bookable.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  function pickHost(id: string) {
    setHostId(id);
    setDay(null);
    setSlot(null);
  }

  function submit() {
    if (!slot) return toast.error("Chưa chọn giờ hẹn", "Chạm vào 1 ô giờ còn trống.");
    startTransition(async () => {
      const res = await bookConsultation({ studentId, hostId, startsAt: slot.startsAt, topic });
      if (!res.ok) {
        toast.error("Chưa đặt được lịch", res.error);
        // Ô vừa bị người khác đặt → tải lại danh sách ô trống
        router.refresh();
        setSlot(null);
        return;
      }
      toast.success("Đã gửi lịch hẹn", "Bạn nhận thông báo ngay khi lịch được xác nhận.");
      setSlot(null);
      setTopic("");
      document.getElementById(`b-${res.data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <section className="space-y-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="book-title">
      <h2 id="book-title" className="flex items-center gap-2 text-lg font-bold">
        <CalendarCheck className="size-5 text-primary" /> {title}
      </h2>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Trao đổi với</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn người trao đổi">
          {bookable.map((h) => (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={h.id === hostId}
              onClick={() => pickHost(h.id)}
              className={cn("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", h.id === hostId ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted")}
            >
              {hostLabel(h)}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">Chưa có khung giờ trống trong 3 tuần tới. Vui lòng quay lại sau hoặc nhắn tin trực tiếp.</p>
      ) : (
        <>
          <div>
            <p className="mb-1.5 text-sm font-semibold">1. Chọn ngày</p>
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Chọn ngày">
              {days.map((d) => {
                const on = activeDay?.date === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={d.free === 0}
                    onClick={() => {
                      setDay(d.date);
                      setSlot(null);
                    }}
                    className={cn(
                      "flex w-16 shrink-0 snap-start flex-col items-center rounded-2xl py-2 ring-1 transition-colors disabled:opacity-40",
                      on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
                    )}
                  >
                    <span className="text-xs font-semibold">{weekdayShort(d.date)}</span>
                    <span className="text-lg font-extrabold leading-tight">{d.date.slice(8, 10)}</span>
                    <span className={cn("text-[11px]", on ? "text-primary-foreground/85" : "text-muted-foreground")}>{d.free ? `${d.free} ô trống` : "Kín lịch"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeDay && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">2. Chọn giờ</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Chọn giờ hẹn">
                {activeDay.slots.map((s) => {
                  const on = slot?.startsAt === s.startsAt;
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!s.available}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-xl px-2 py-2 text-center ring-1 transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:line-through",
                        on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
                      )}
                    >
                      <span className="block text-sm font-bold tabular-nums">{vnTime(s.startsAt)}</span>
                      <span className={cn("block text-[11px]", on ? "text-primary-foreground/85" : "text-muted-foreground")}>
                        {s.available ? `${MODE_LABELS[modeOf(s.mode)].emoji} ${MODE_LABELS[modeOf(s.mode)].short}` : "Đã có lịch"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Label htmlFor="topic" className="text-sm font-semibold">
              3. Nội dung muốn trao đổi
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">
                  {t}
                </button>
              ))}
            </div>
            <Textarea
              id="topic"
              rows={3}
              maxLength={500}
              required
              minLength={5}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`VD: ${suggestions[0] ?? ""}`}
            />
            <Button type="submit" className="w-full sm:w-auto" disabled={pending || !slot || topic.trim().length < 5}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {slot ? `Gửi lịch hẹn ${slotLabel(slot.startsAt, slot.endsAt)}` : "Chọn giờ hẹn để gửi"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
