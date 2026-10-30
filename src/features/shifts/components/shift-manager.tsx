"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Clock, Pause, Play, Plus, School, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { WEEKDAY_OPTIONS, shiftTimeLabel, weekdaysLabel, type IsoWeekday } from "@/lib/shifts";
import { cn } from "@/lib/utils";
import { createShift, deleteShift, setShiftActive } from "../actions";
import type { ShiftRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const PRESETS: { label: string; days: IsoWeekday[] }[] = [
  { label: "Thứ 2 – Thứ 7", days: [1, 2, 3, 4, 5, 6] },
  { label: "Thứ 2 – Thứ 6", days: [1, 2, 3, 4, 5] },
  { label: "T2, T4, T6", days: [1, 3, 5] },
  { label: "T3, T5, T7", days: [2, 4, 6] },
  { label: "Cuối tuần", days: [6, 7] },
];

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** Buổi trong ngày theo cách nói tiếng Việt (giúp đọc nhanh giờ 24h). */
function dayPart(hour: number): string {
  if (hour < 11) return "sáng";
  if (hour < 13) return "trưa";
  if (hour < 18) return "chiều";
  return "tối";
}

/**
 * Chọn giờ dạng 24h theo chuẩn Việt Nam (HH : mm), hiển thị giống nhau trên mọi trình duyệt —
 * thay cho <input type="time"> vốn hiện AM/PM trên máy cài tiếng Anh. Gửi lên server "HH:MM" qua input ẩn.
 */
function TimeSelect({ id, name, value, onChange, invalid }: { id: string; name: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [hour = "18", minute = "00"] = value.split(":");
  const selectClass = cn(fieldClass, "w-[4.5rem] px-2 text-center font-semibold tabular-nums");
  return (
    <div className="flex items-center gap-1.5">
      <input type="hidden" name={name} value={value} />
      <select id={id} aria-label="Giờ" aria-invalid={invalid} className={selectClass} value={hour} onChange={(e) => onChange(`${e.target.value}:${minute}`)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="font-bold">:</span>
      <select aria-label="Phút" aria-invalid={invalid} className={selectClass} value={minute} onChange={(e) => onChange(`${hour}:${e.target.value}`)}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span className="text-xs font-medium text-muted-foreground">({dayPart(Number(hour))})</span>
    </div>
  );
}

/** Tóm tắt khung giờ + thời lượng; cảnh báo ngay khi giờ kết thúc không sau giờ bắt đầu. */
function ShiftDuration({ start, end }: { start: string; end: string }) {
  const toMin = (t: string) => {
    const [h = 0, m = 0] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minutes = toMin(end) - toMin(start);
  if (minutes <= 0) {
    return <p className="-mt-1 text-xs font-medium text-destructive">Giờ kết thúc phải sau giờ bắt đầu.</p>;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = [h && `${h} giờ`, m && `${m} phút`].filter(Boolean).join(" ");
  return (
    <p className="-mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="size-3.5" />
      <span>
        <b className="font-semibold text-foreground">
          {start} – {end}
        </b>{" "}
        ({duration}) · Giờ Việt Nam (GMT+7), định dạng 24 giờ
      </span>
    </p>
  );
}

const DEFAULT_START = "18:00";
const DEFAULT_END = "19:30";

function CreateShiftForm() {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createShift);
  const [days, setDays] = useState<IsoWeekday[]>([1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);

  const toggle = (d: IsoWeekday) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onReset={() => {
        setDays([1, 2, 3, 4, 5, 6]);
        setStart(DEFAULT_START);
        setEnd(DEFAULT_END);
      }}
      noValidate
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Plus className="size-5 text-primary" /> Tạo ca học mới
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tên ca" htmlFor="shift-name" error={err.name} className="sm:col-span-3">
          <input id="shift-name" name="name" className={fieldClass} placeholder="vd: Ca tối 1" maxLength={60} required aria-invalid={!!err.name} />
        </Field>
        <Field label="Giờ bắt đầu" htmlFor="shift-start" error={err.startTime}>
          <TimeSelect id="shift-start" name="startTime" value={start} onChange={setStart} invalid={!!err.startTime} />
        </Field>
        <Field label="Giờ kết thúc" htmlFor="shift-end" error={err.endTime}>
          <TimeSelect id="shift-end" name="endTime" value={end} onChange={setEnd} invalid={!!err.endTime} />
        </Field>
      </div>
      <ShiftDuration start={start} end={end} />

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Ngày học trong tuần</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_OPTIONS.map((d) => {
            const on = days.includes(d.value);
            return (
              <label
                key={d.value}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-bold ring-1 transition-colors",
                  on ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border",
                )}
              >
                <input type="checkbox" name="weekdays" value={d.value} checked={on} onChange={() => toggle(d.value)} className="sr-only" />
                <span aria-label={d.long}>{d.short}</span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDays(p.days)}
              className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground active:bg-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        {err.weekdays && <p className="text-xs font-medium text-destructive">{err.weekdays}</p>}
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <Plus /> Tạo ca học
      </SubmitButton>
    </form>
  );
}

function ShiftCard({ shift }: { shift: ShiftRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Không lưu được.");
    });
  }

  async function remove() {
    const note = shift.classes.length ? ` ${shift.classes.length} lớp đang dùng ca này sẽ chuyển về lịch mặc định.` : "";
    if (await confirmSheet({ title: `Xoá ca "${shift.name}"?`, description: note.trim() || undefined, confirmLabel: "Xoá ca", tone: "danger" })) run(() => deleteShift(shift.id));
  }

  return (
    <li className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", pending && "opacity-60", !shift.is_active && "bg-muted/50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-extrabold">
            {shift.name}
            {!shift.is_active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">Tạm ngưng</span>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="size-4 text-primary" /> {shiftTimeLabel(shift)}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" /> {weekdaysLabel(shift.weekdays)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pending}
            onClick={() => run(() => setShiftActive(shift.id, !shift.is_active))}
            aria-label={shift.is_active ? "Tạm ngưng ca" : "Kích hoạt lại ca"}
            title={shift.is_active ? "Tạm ngưng" : "Kích hoạt lại"}
          >
            {shift.is_active ? <Pause /> : <Play />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={pending} onClick={remove} aria-label="Xoá ca" title="Xoá ca">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <School className="size-4 text-muted-foreground" />
        {shift.classes.length ? (
          shift.classes.map((c) => (
            <span key={c.id} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              Lớp {c.name} · {CAMPUS_LABELS[c.campus]}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Chưa có lớp nào — gán ca cho lớp ở trang Lớp học.</span>
        )}
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </li>
  );
}

export function ShiftManager({ shifts }: { shifts: ShiftRow[] }) {
  return (
    <div className="space-y-5">
      <CreateShiftForm />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Danh sách ca học ({shifts.length})</h2>
        {shifts.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Chưa có ca học nào. Các lớp đang dùng lịch mặc định Thứ 2 – Thứ 7, 18:00 – 19:30.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shifts.map((s) => (
              <ShiftCard key={s.id} shift={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
