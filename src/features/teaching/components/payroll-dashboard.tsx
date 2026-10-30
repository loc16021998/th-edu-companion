"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Plus, TriangleAlert, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { addMonths, fullDate, weekdayShort } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { addManualSession, adjustTeachingSession } from "../actions";
import {
  PAID_STATUSES,
  PAY_SUBJECTS,
  SESSION_STATUS,
  campusShort,
  clock,
  minutesBetween,
  monthLabel,
  subjectLabel,
  type PayrollRow,
  type SessionRecord,
  type SessionStatus,
} from "../constants";

type Session = SessionRecord & { teacher_id: string };
type ClassOption = { id: string; campus: Enums<"campus">; name: string };

const EDITABLE: SessionStatus[] = ["completed", "missed_checkout", "manual", "cancelled"];
const toTime = (iso: string | null) => (iso ? clock(iso) : "");

function SessionEditor({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(toTime(session.checked_in_at));
  const [checkOut, setCheckOut] = useState(toTime(session.checked_out_at));
  const [status, setStatus] = useState(session.status === "in_progress" ? "completed" : session.status);
  const [note, setNote] = useState(session.note ?? "");
  const [pending, startTransition] = useTransition();
  const st = SESSION_STATUS[session.status as SessionStatus];
  const mins = minutesBetween(session.checked_in_at, session.checked_out_at);
  const flagged = session.status === "missed_checkout" || session.status === "in_progress" || (session.off_schedule && session.status !== "cancelled");

  const save = () =>
    startTransition(async () => {
      const res = await adjustTeachingSession({ id: session.id, checkIn, checkOut, status: status as "completed", note });
      if (res.ok) {
        toast.success("Đã lưu ca dạy");
        setOpen(false);
      } else toast.error("Chưa lưu được", res.error);
    });

  return (
    <li className={cn("rounded-xl bg-card p-3 ring-1", flagged ? "ring-amber-300" : "ring-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            {weekdayShort(session.date)} {fullDate(session.date)} · Lớp {session.class_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {campusShort(session.campus)} · {subjectLabel(session.subject)} · {clock(session.checked_in_at)} – {clock(session.checked_out_at)}
            {mins !== null && ` (${mins} phút)`}
            {session.rate !== null && ` · ${formatVND(session.rate)}`}
          </p>
          {session.off_schedule && <p className="text-xs font-semibold text-amber-700">Ngoài lịch ca học</p>}
          {session.note && <p className="text-xs text-muted-foreground">Ghi chú: {session.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", st?.badge)}>{st?.label ?? session.status}</span>
          <Button type="button" size="sm" variant="outline" className="min-h-8 rounded-lg" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            Sửa
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Bắt đầu
            <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Kết thúc
            <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={fieldClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Trạng thái
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
              {EDITABLE.map((s) => (
                <option key={s} value={s}>
                  {SESSION_STATUS[s].label}
                  {PAID_STATUSES.includes(s) ? "" : " (không tính lương)"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Ghi chú
            <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="Vd: đã xác nhận với cô" />
          </label>
          <Button type="button" className="h-10 rounded-xl sm:col-span-2" disabled={pending} onClick={save}>
            {pending && <Loader2 className="animate-spin" />} Lưu ca dạy
          </Button>
        </div>
      )}
    </li>
  );
}

function ManualSessionForm({ teacherId, classes, month, onDone }: { teacherId: string; classes: ClassOption[]; month: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [checkIn, setCheckIn] = useState("18:00");
  const [checkOut, setCheckOut] = useState("19:30");
  const [note, setNote] = useState("");

  const save = () =>
    startTransition(async () => {
      const res = await addManualSession({ teacherId, classId, date, checkIn, checkOut, note });
      if (res.ok) {
        toast.success("Đã thêm ca dạy");
        onDone();
      } else toast.error("Chưa thêm được ca", res.error);
    });

  return (
    <div className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
        Lớp
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={fieldClass}>
          <option value="">— Chọn lớp —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              Lớp {c.name} · {campusShort(c.campus)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
        Ngày dạy
        <input type="date" value={date} min={`${month}-01`} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
        Bắt đầu
        <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={fieldClass} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
        Kết thúc
        <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={fieldClass} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
        Lý do *
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="Vd: cô quên bấm bắt đầu ca" />
      </label>
      <Button type="button" className="h-10 rounded-xl sm:col-span-2" disabled={pending || !classId || !date || note.trim().length < 3} onClick={save}>
        {pending && <Loader2 className="animate-spin" />} Thêm ca dạy
      </Button>
    </div>
  );
}

/** Bảng lương tháng: Σ ca hợp lệ × đơn giá buổi theo môn. Xem / sửa từng ca, thêm ca quên bấm, xuất Excel / CSV. */
export function PayrollDashboard({ month, rows, sessions, classes }: { month: string; rows: PayrollRow[]; sessions: Session[]; classes: ClassOption[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const open = rows.find((r) => r.teacherId === openId);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const flagged = rows.reduce((s, r) => s + r.flagged, 0);
  const active = rows.filter((r) => r.sessions > 0).length;
  const missingRate = rows.some((r) => r.missingRate);
  const href = (m: string) => `/admin/payroll?month=${m}`;
  const exportHref = (format: "xlsx" | "csv") => `/admin/payroll/export?${new URLSearchParams({ month, format })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={href(addMonths(`${month}-01`, -1).slice(0, 7))}
            aria-label="Tháng trước"
            className="tap flex size-10 items-center justify-center rounded-xl bg-card ring-1 ring-border"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h2 className="px-2 text-base font-bold">{monthLabel(month)}</h2>
          <Link
            href={href(addMonths(`${month}-01`, 1).slice(0, 7))}
            aria-label="Tháng sau"
            className="tap flex size-10 items-center justify-center rounded-xl bg-card ring-1 ring-border"
          >
            <ChevronRight className="size-5" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-600/90">
            <a href={exportHref("xlsx")} download>
              <FileSpreadsheet /> Xuất Excel
            </a>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-xl">
            <a href={exportHref("csv")} download>
              <FileText /> CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Wallet className="size-3.5" /> Tổng quỹ lương
          </p>
          <p className="text-xl font-extrabold tabular-nums text-emerald-700">{formatVND(total)}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="text-xs font-semibold text-muted-foreground">Tổng số buổi</p>
          <p className="text-xl font-extrabold tabular-nums">{totalSessions}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Users className="size-3.5" /> Giáo viên có ca
          </p>
          <p className="text-xl font-extrabold tabular-nums">{active}</p>
        </div>
        <div className={cn("rounded-2xl p-3 shadow-sm ring-1", flagged ? "bg-amber-50 ring-amber-200" : "bg-card ring-border")}>
          <p className="text-xs font-semibold text-muted-foreground">Ca cần xem lại</p>
          <p className={cn("text-xl font-extrabold tabular-nums", flagged && "text-amber-800")}>{flagged}</p>
        </div>
      </div>

      {missingRate && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Có ca chưa có đơn giá (tính 0đ).{" "}
            <Link href="/admin/payroll/settings" className="font-semibold underline">
              Đặt đơn giá theo môn
            </Link>
            .
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-card shadow-sm ring-1 ring-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Giáo viên</th>
              <th className="px-3 py-2.5">Số buổi × đơn giá</th>
              <th className="px-3 py-2.5 text-right">Tổng buổi</th>
              <th className="px-3 py-2.5 text-right">Thành tiền</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.teacherId} className={cn(r.sessions === 0 && "text-muted-foreground")}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{r.teacherName}</p>
                  {r.flagged > 0 && <p className="text-xs font-semibold text-amber-700">{r.flagged} ca cần xem lại</p>}
                </td>
                <td className="px-3 py-2.5">
                  {r.lines.length === 0 ? (
                    "—"
                  ) : (
                    <ul className="space-y-0.5">
                      {r.lines.map((l) => (
                        <li key={`${l.subject}:${l.rate}`} className="text-xs">
                          <span className="font-semibold">{PAY_SUBJECTS[l.subject]}</span>: {l.sessions} ×{" "}
                          {l.rate === null ? <span className="text-amber-700">chưa có đơn giá</span> : formatVND(l.rate)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.sessions}</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">{formatVND(r.amount)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button type="button" size="sm" variant="outline" className="min-h-8 rounded-lg" onClick={() => setOpenId(r.teacherId)}>
                    Chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/40 font-bold">
            <tr>
              <td className="px-3 py-2.5" colSpan={2}>
                Tổng cộng
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totalSessions}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatVND(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Chưa có tài khoản giáo viên.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Công thức: Tổng số buổi dạy thực tế × Đơn giá lương theo buổi của môn. Tính lương: ca “Đã dạy”, “Quên kết thúc ca” và “Quản trị ghi nhận”; ca “Đã huỷ”
        không tính. Đơn giá được chốt lúc kết thúc ca — đổi đơn giá chỉ áp dụng cho ca sau đó.
      </p>

      <Sheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setAdding(false);
          }
        }}
      >
        <SheetContent className="sm:max-w-2xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.teacherName}</SheetTitle>
                <SheetDescription>
                  {monthLabel(month)} · {open.sessions} buổi · {formatVND(open.amount)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3">
                {adding ? (
                  <ManualSessionForm teacherId={open.teacherId} classes={classes} month={month} onDone={() => setAdding(false)} />
                ) : (
                  <Button type="button" variant="outline" className="h-10 w-full rounded-xl" onClick={() => setAdding(true)}>
                    <Plus /> Thêm ca (quên bấm / dạy bù)
                  </Button>
                )}
                <ul className="space-y-2">
                  {sessions
                    .filter((s) => s.teacher_id === open.teacherId)
                    .map((s) => (
                      <SessionEditor key={`${s.id}:${s.status}:${s.checked_in_at}:${s.checked_out_at}`} session={s} />
                    ))}
                </ul>
                {!sessions.some((s) => s.teacher_id === open.teacherId) && <p className="text-sm text-muted-foreground">Chưa có ca dạy trong tháng.</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
