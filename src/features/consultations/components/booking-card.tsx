"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2, MapPin, Phone, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn, givenName } from "@/lib/utils";
import { cancelBooking, decideBooking } from "../actions";
import { MODE_LABELS, STATUS_LABELS } from "../constants";
import type { Booking, Party } from "../queries";
import { bookingIcs, slotLabel, startsIn } from "../time";

const MODE_ICON = { online: Video, in_person: MapPin, phone: Phone } as const;

/** "còn 25 phút" — chỉ tính sau khi gắn vào trang (tránh lệch HTML server / client), cập nhật mỗi 30 giây. */
function Countdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const label = now === null ? null : startsIn(startsAt, now);
  if (!label) return null;
  const soon = new Date(startsAt).getTime() - (now ?? 0) <= 60 * 60_000;
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", soon ? "bg-orange-100 text-orange-800" : "bg-sky-100 text-sky-800")}>⏰ {label}</span>;
}

/** "Ban quản lý · Chị Mai" / "Cô Hường" / "PH Chị Lan (bé An · T2B)" */
export function partyLabel(p: Party, b: Pick<Booking, "studentName" | "className">): string {
  if (p.role === "admin") return `Ban quản lý · ${p.name}`;
  if (p.role === "teacher") return p.name;
  return `PH ${p.name}${b.studentName ? ` (bé ${givenName(b.studentName)}${b.className ? ` · ${b.className}` : ""})` : ""}`;
}

function downloadIcs(b: Booking, counterpart: string) {
  const ics = bookingIcs({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    title: `Hẹn trao đổi với ${counterpart} (TH EDU)`,
    description: `${MODE_LABELS[b.mode].label}. Nội dung: ${b.topic}`,
    location: b.mode === "in_person" ? b.location : b.mode === "online" ? b.meetingUrl : null,
    url: b.mode === "online" ? b.meetingUrl : null,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "lich-hen-th-edu.ics" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Dialog = { kind: "confirm" | "decline" | "cancel" } | null;

/**
 * 1 lịch hẹn, hiển thị theo góc nhìn người xem:
 *  - người chủ trì (giáo viên / quản trị viên): xác nhận, không nhận, huỷ lịch đã xác nhận;
 *  - khách (phụ huynh / giáo viên): huỷ, vào phòng họp, thêm vào lịch điện thoại;
 *  - quản trị viên quản lý lịch của người khác (`canManage`): xác nhận / không nhận thay người chủ trì, huỷ.
 */
export function BookingCard({ booking: b, meId, now, canManage = false }: { booking: Booking; meId: string; now: string; canManage?: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState(b.meetingUrl ?? "");
  const [pending, startTransition] = useTransition();
  const isHost = b.host.id === meId;
  const isGuest = b.guest.id === meId;
  const observer = !isHost && !isGuest;
  const upcoming = b.startsAt > now;
  const live = (b.status === "pending" || b.status === "confirmed") && upcoming;
  const ModeIcon = MODE_ICON[b.mode];
  const status = STATUS_LABELS[b.status];
  const hostLabel = partyLabel(b.host, b);
  const guestLabel = partyLabel(b.guest, b);
  const counterpart = isGuest ? hostLabel : guestLabel;

  const statusText =
    !upcoming && b.status === "confirmed"
      ? "Đã diễn ra"
      : b.status === "pending"
        ? isHost
          ? "Chờ bạn xác nhận"
          : observer
            ? `Chờ ${b.host.name} xác nhận`
            : status.label
        : b.status === "declined" && isHost
          ? "Bạn đã từ chối"
          : status.label;
  const cancelledText =
    b.cancelledBy === meId ? "Bạn đã huỷ" : b.cancelledBy === b.host.id ? `${b.host.name} đã huỷ` : b.cancelledBy === b.guest.id ? `${b.guest.name} đã huỷ` : "Ban quản lý đã huỷ";

  const canDecide = b.status === "pending" && (isHost || (observer && canManage));
  const canCancel = isGuest || (isHost && b.status === "confirmed") || (observer && canManage);

  const open = (kind: NonNullable<Dialog>["kind"]) => {
    setNote("");
    setLink(b.meetingUrl ?? "");
    setDialog({ kind });
  };

  function submit() {
    if (!dialog) return;
    startTransition(async () => {
      const res =
        dialog.kind === "cancel"
          ? await cancelBooking({ id: b.id, reason: note })
          : await decideBooking({ id: b.id, confirm: dialog.kind === "confirm", note, meetingUrl: dialog.kind === "confirm" ? link : "" });
      if (!res.ok) return toast.error("Chưa lưu được", res.error);
      toast.success(
        dialog.kind === "confirm" ? "Đã xác nhận lịch hẹn" : dialog.kind === "decline" ? "Đã báo người đặt chọn giờ khác" : "Đã huỷ lịch hẹn",
        dialog.kind === "confirm" ? "Người đặt nhận thông báo; hệ thống nhắc cả 2 bên trước 30 phút." : "Các bên liên quan nhận thông báo ngay.",
      );
      setDialog(null);
    });
  }

  return (
    <article id={`b-${b.id}`} className="scroll-mt-24 space-y-2.5 rounded-2xl bg-card p-3.5 shadow-sm ring-1 ring-border target:ring-2 target:ring-primary">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", status.className)}>{statusText}</span>
        {live && b.status === "confirmed" && <Countdown startsAt={b.startsAt} />}
        {b.scheduledByAdmin && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">Trung tâm xếp lịch</span>}
      </div>
      <div className="space-y-0.5">
        <p className="text-base font-extrabold">{slotLabel(b.startsAt, b.endsAt)}</p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <ModeIcon className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">
            {MODE_LABELS[b.mode].short}
            {b.mode === "in_person" && b.location ? ` · ${b.location}` : ""}
          </span>
        </p>
        {observer ? (
          <p className="break-words text-sm">
            <span className="font-semibold">{hostLabel}</span>
            <span className="text-muted-foreground"> chủ trì · với </span>
            <span className="font-semibold">{guestLabel}</span>
          </p>
        ) : (
          <p className="break-words text-sm font-medium">{counterpart}</p>
        )}
      </div>
      <p className="break-words rounded-xl bg-muted/60 px-3 py-2 text-sm">“{b.topic}”</p>
      {b.hostNote && (
        <p className="break-words text-sm">
          <span className="font-semibold">{isHost ? "Lời nhắn của bạn: " : `Lời nhắn của ${b.host.name}: `}</span>
          {b.hostNote}
        </p>
      )}
      {b.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">
          {cancelledText}
          {b.cancelReason ? `: ${b.cancelReason}` : ""}
        </p>
      )}

      {live && (canDecide || canCancel || b.status === "confirmed") && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canDecide && (
            <>
              <Button size="sm" onClick={() => open("confirm")}>
                <Check className="size-4" /> Xác nhận lịch hẹn
              </Button>
              <Button size="sm" variant="outline" onClick={() => open("decline")}>
                Không nhận
              </Button>
            </>
          )}
          {b.status === "confirmed" && b.mode === "online" && b.meetingUrl && (
            <Button size="sm" asChild>
              <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer">
                <Video className="size-4" /> Vào phòng họp
              </a>
            </Button>
          )}
          {b.status === "confirmed" && !observer && (
            <Button size="sm" variant="outline" onClick={() => downloadIcs(b, counterpart)}>
              <CalendarPlus className="size-4" /> Thêm vào lịch
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => open("cancel")}>
              <X className="size-4" /> Huỷ lịch
            </Button>
          )}
        </div>
      )}

      <Sheet open={!!dialog} onOpenChange={(o) => !o && !pending && setDialog(null)}>
        <SheetContent locked={pending}>
          {dialog && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <SheetHeader>
                <SheetTitle>{dialog.kind === "confirm" ? "Xác nhận lịch hẹn" : dialog.kind === "decline" ? "Không nhận lịch hẹn này" : "Huỷ lịch hẹn"}</SheetTitle>
                <SheetDescription>
                  {slotLabel(b.startsAt, b.endsAt)} · {observer ? `${hostLabel} — ${guestLabel}` : counterpart}
                </SheetDescription>
              </SheetHeader>
              {dialog.kind === "confirm" && b.mode === "online" && (
                <div className="space-y-1">
                  <Label htmlFor={`link-${b.id}`}>Link phòng họp (Google Meet, Zoom…)</Label>
                  <Input id={`link-${b.id}`} type="url" inputMode="url" placeholder="https://meet.google.com/..." value={link} onChange={(e) => setLink(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={`note-${b.id}`}>
                  {dialog.kind === "decline" ? "Lý do (bắt buộc)" : dialog.kind === "cancel" ? "Lý do huỷ" : "Lời nhắn cho người đặt (không bắt buộc)"}
                </Label>
                <Textarea
                  id={`note-${b.id}`}
                  rows={3}
                  maxLength={300}
                  required={dialog.kind === "decline"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    dialog.kind === "decline"
                      ? "VD: Giờ này có lịch họp chuyên môn, anh/chị chọn giúp khung 17:00 nhé."
                      : dialog.kind === "confirm"
                        ? "VD: Anh/chị chuẩn bị giúp vở luyện chữ của bé nhé."
                        : "VD: Có việc đột xuất."
                  }
                />
              </div>
              <Button type="submit" className="w-full" variant={dialog.kind === "cancel" ? "destructive" : "default"} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {dialog.kind === "confirm" ? "Xác nhận lịch hẹn" : dialog.kind === "decline" ? "Gửi lý do" : "Huỷ lịch hẹn"}
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </article>
  );
}
