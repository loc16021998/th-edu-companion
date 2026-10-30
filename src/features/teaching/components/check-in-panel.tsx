"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleStop, Loader2, MapPin, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { fieldClass } from "@/components/shared/form-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { endTeachingSession, startTeachingSession } from "../actions";
import {
  SUBJECT_TONE,
  campusShort,
  clock,
  minutesBetween,
  roomLabel,
  subjectLabel,
  type Occurrence,
  type PaySubject,
  type ScheduleClass,
  type SessionRecord,
} from "../constants";

/** Đồng hồ đếm thời gian đang dạy (cập nhật mỗi 30 giây). */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return (
    <span className="tabular-nums">
      {Math.floor(mins / 60) > 0 && `${Math.floor(mins / 60)} giờ `}
      {mins % 60} phút
    </span>
  );
}

type StartTarget = { classId: string; className: string; campus: ScheduleClass["campus"]; subject: string };

/**
 * Bắt đầu / kết thúc ca dạy. Xác nhận ghi RÕ lớp + cơ sở trước khi bắt đầu (tránh nhầm cơ sở);
 * ngoài giờ ca → hỏi lý do (dạy bù / đổi ca) rồi gửi lại.
 */
export function useCheckIn() {
  const [pending, startTransition] = useTransition();
  const [needNote, setNeedNote] = useState<{ target: StartTarget; message: string } | null>(null);
  const [note, setNote] = useState("");

  const start = (target: StartTarget, reason?: string) =>
    startTransition(async () => {
      if (
        !reason &&
        !(await confirmSheet({
          title: `Bắt đầu ca dạy lớp ${target.className}?`,
          description: `Cơ sở: ${campusShort(target.campus)} · ${subjectLabel(target.subject)}. Giờ bắt đầu được ghi theo máy chủ.`,
          confirmLabel: "Bắt đầu ca dạy",
        }))
      )
        return;
      const res = await startTeachingSession(target.classId, reason);
      if (res.ok) {
        toast.success(`Đã bắt đầu ca lớp ${target.className}`, "Nhớ bấm “Kết thúc ca dạy” khi tan lớp.");
        setNeedNote(null);
        setNote("");
      } else if (res.needNote) {
        setNeedNote({ target, message: res.error });
      } else toast.error("Chưa bắt đầu được ca dạy", res.error);
    });

  const end = (session: Pick<SessionRecord, "id" | "class_name" | "checked_in_at">) =>
    startTransition(async () => {
      const mins = session.checked_in_at ? Math.floor((Date.now() - new Date(session.checked_in_at).getTime()) / 60_000) : 0;
      if (
        !(await confirmSheet({
          title: `Kết thúc ca lớp ${session.class_name}?`,
          description: mins < 20 ? `Ca mới bắt đầu ${mins} phút trước — chắc chắn đã dạy xong?` : `Đã dạy khoảng ${mins} phút.`,
          confirmLabel: "Kết thúc ca dạy",
        }))
      )
        return;
      const res = await endTeachingSession(session.id);
      if (res.ok) toast.success("Đã kết thúc ca dạy", "Buổi dạy đã được ghi nhận để tính lương.");
      else toast.error("Chưa kết thúc được ca", res.error);
    });

  const noteSheet = (
    <Sheet open={!!needNote} onOpenChange={(o) => !o && setNeedNote(null)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Bắt đầu ca ngoài lịch</SheetTitle>
          <SheetDescription>{needNote?.message}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3">
          <label htmlFor="checkin-note" className="text-xs font-semibold text-muted-foreground">
            Lý do (quản trị viên sẽ xem lại)
          </label>
          <input
            id="checkin-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Vd: dạy bù buổi Thứ 4, dạy thay cô Hà"
            className={fieldClass}
          />
          <Button
            type="button"
            className="h-11 w-full rounded-xl"
            disabled={pending || note.trim().length < 3}
            onClick={() => needNote && start(needNote.target, note.trim())}
          >
            {pending && <Loader2 className="animate-spin" />} Bắt đầu ca dạy
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return { pending, start, end, noteSheet };
}

/** Thẻ 1 ca hôm nay: chưa bắt đầu / đang dạy / đã xong. */
function TodayItem({ occ, busy, onStart, onEnd, onOpen }: { occ: Occurrence; busy: boolean; onStart: () => void; onEnd: () => void; onOpen: () => void }) {
  const s = occ.session;
  const running = s?.status === "in_progress";
  const done = s && !running;
  return (
    <li className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1", running ? "ring-2 ring-sky-400" : "ring-border")}>
      <button type="button" onClick={onOpen} className="block w-full space-y-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-extrabold tabular-nums">
            {occ.start} – {occ.end}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", SUBJECT_TONE[occ.subject as PaySubject] ?? SUBJECT_TONE.tong_hop)}>
            {subjectLabel(occ.subject)}
          </span>
        </div>
        <p className="font-semibold">
          Lớp {occ.className}
          {occ.room && <span className="font-medium text-muted-foreground"> · {roomLabel(occ.room)}</span>}
        </p>
        <p className="flex items-center gap-1 text-sm font-semibold text-primary">
          <MapPin className="size-4" /> {campusShort(occ.campus)}
        </p>
      </button>

      {running && s.checked_in_at && (
        <p className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">
          <Timer className="size-4 animate-pulse" /> Đang dạy từ {clock(s.checked_in_at)} · <Elapsed since={s.checked_in_at} />
        </p>
      )}
      {done && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          ✓ Đã dạy {clock(s.checked_in_at)} – {clock(s.checked_out_at)}
          {minutesBetween(s.checked_in_at, s.checked_out_at) !== null && ` (${minutesBetween(s.checked_in_at, s.checked_out_at)} phút)`}
        </p>
      )}

      {!s && (
        <Button type="button" className="h-12 w-full rounded-xl text-base" disabled={busy} onClick={onStart}>
          {busy ? <Loader2 className="animate-spin" /> : <Play />} Bắt đầu ca dạy
        </Button>
      )}
      {running && (
        <Button type="button" variant="destructive" className="h-12 w-full rounded-xl text-base" disabled={busy} onClick={onEnd}>
          {busy ? <Loader2 className="animate-spin" /> : <CircleStop />} Kết thúc ca dạy
        </Button>
      )}
    </li>
  );
}

/** Ca hôm nay + ca đang mở (kể cả ca dạy thay / ngoài lịch) + bắt đầu ca cho lớp khác. */
export function CheckInPanel({
  today,
  occurrences,
  openSession,
  classes,
  onOpen,
}: {
  today: string;
  occurrences: Occurrence[];
  openSession: SessionRecord | null;
  /** Lớp được phép bắt đầu ca ngoài lịch (lớp của mình + lớp dạy thay) */
  classes: ScheduleClass[];
  onOpen: (occ: Occurrence) => void;
}) {
  const { pending, start, end, noteSheet } = useCheckIn();
  const [other, setOther] = useState("");
  const todays = occurrences.filter((o) => o.date === today);
  // Ca đang mở mà không nằm trong lịch hôm nay (dạy thay lớp khác / quên kết thúc từ trước)
  const strayOpen = openSession && !todays.some((o) => o.session?.id === openSession.id) ? openSession : null;
  const pickable = classes;

  return (
    <section className="space-y-3" aria-labelledby="today-heading">
      <h2 id="today-heading" className="text-base font-bold">
        Ca dạy hôm nay
      </h2>
      {strayOpen && (
        <div className="space-y-2 rounded-2xl bg-sky-50 p-4 ring-2 ring-sky-300">
          <p className="text-sm font-semibold text-sky-900">
            Bạn đang mở ca lớp {strayOpen.class_name} tại {campusShort(strayOpen.campus)} (bắt đầu {clock(strayOpen.checked_in_at)})
          </p>
          <Button type="button" variant="destructive" className="h-11 w-full rounded-xl" disabled={pending} onClick={() => end(strayOpen)}>
            <CircleStop /> Kết thúc ca dạy
          </Button>
        </div>
      )}
      {todays.length === 0 ? (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Hôm nay bạn không có ca dạy theo lịch.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {todays.map((o) => (
            <TodayItem
              key={o.key}
              occ={o}
              busy={pending}
              onOpen={() => onOpen(o)}
              onStart={() => o.classId && start({ classId: o.classId, className: o.className, campus: o.campus, subject: o.subject })}
              onEnd={() => o.session && end(o.session)}
            />
          ))}
        </ul>
      )}

      {pickable.length > 0 && (
        <details className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <summary className="cursor-pointer text-sm font-semibold">Dạy thay / dạy bù lớp khác</summary>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select value={other} onChange={(e) => setOther(e.target.value)} aria-label="Chọn lớp" className={cn(fieldClass, "flex-1")}>
              <option value="">— Chọn lớp —</option>
              {pickable.map((c) => (
                <option key={c.id} value={c.id}>
                  Lớp {c.name} · {campusShort(c.campus)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              className="h-11 rounded-xl"
              disabled={!other || pending}
              onClick={() => {
                const c = pickable.find((x) => x.id === other);
                if (c) start({ classId: c.id, className: c.name, campus: c.campus, subject: c.subject ?? "tong_hop" });
              }}
            >
              <Play /> Bắt đầu ca
            </Button>
          </div>
        </details>
      )}
      {noteSheet}
    </section>
  );
}
