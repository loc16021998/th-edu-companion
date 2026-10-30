"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCheck, Loader2, Plus, Save, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { FEE_STATUS_STYLE, feeIcon } from "@/config/ui-styles";
import { CAMPUS_LABELS } from "@/config/constants";
import { fullDate } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { createFee, deleteFee, recordPayment } from "../actions";
import type { ClassRow, FeeRow, StudentRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

type Target = "student" | "class";

function CreateFeeForm({ classes, students, today }: { classes: ClassRow[]; students: StudentRow[]; today: string }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createFee);
  const [target, setTarget] = useState<Target>("class");
  const [amount, setAmount] = useState("");
  const month = `${today.slice(5, 7)}/${today.slice(0, 4)}`;
  const suggestions = [`Học phí tháng ${month}`, "Giáo trình", "Đồ dùng học tập"];
  const [title, setTitle] = useState("");

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onReset={() => {
        setAmount("");
        setTitle("");
      }}
      className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Plus className="size-5 text-primary" /> Tạo khoản thu
      </h2>

      <input type="hidden" name="target" value={target} />
      <div role="radiogroup" aria-label="Áp dụng cho" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(
          [
            ["class", "Cả lớp"],
            ["student", "Một học sinh"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={target === value}
            onClick={() => setTarget(value)}
            className={cn(
              "h-9 rounded-lg text-sm font-semibold transition-colors",
              target === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {target === "class" ? (
          <Field label="Lớp" htmlFor="f-class" error={err.classId}>
            <select id="f-class" name="classId" className={fieldClass} defaultValue={classes[0]?.id}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.studentCount} HS)
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Học sinh" htmlFor="f-student" error={err.studentId}>
            <select id="f-student" name="studentId" className={fieldClass} defaultValue="">
              <option value="" disabled>
                — Chọn học sinh —
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · Lớp {s.class_name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Tên khoản thu" htmlFor="f-title" error={err.title}>
          <input
            id="f-title"
            name="title"
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`vd: Học phí tháng ${month}`}
            required
          />
        </Field>
      </div>
      <div className="-mt-1 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTitle(s)}
            className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground active:bg-accent"
          >
            + {s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Số tiền (VNĐ)" htmlFor="f-amount" error={err.amount} hint={amount ? formatVND(Number(amount)) : undefined}>
          <input
            id="f-amount"
            name="amount"
            type="number"
            inputMode="numeric"
            min={1000}
            step={1000}
            className={fieldClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="vd: 1500000"
            required
          />
        </Field>
        <Field label="Hạn đóng" htmlFor="f-due" error={err.dueDate}>
          <input id="f-due" name="dueDate" type="date" min={today} className={fieldClass} />
        </Field>
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <Wallet /> Tạo khoản thu
      </SubmitButton>
    </form>
  );
}

function FeeItem({ fee, today }: { fee: FeeRow; today: string }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [paid, setPaid] = useState(String(fee.paid_amount));
  const [error, setError] = useState<string | null>(null);
  const { icon: Icon, bubble } = feeIcon(fee.title);
  const style = FEE_STATUS_STYLE[fee.status];
  const overdue = fee.status !== "paid" && fee.due_date !== null && fee.due_date < today;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Không lưu được.");
      else setEditing(false);
    });
  }

  return (
    <li className={cn("space-y-2 p-3", pending && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", bubble)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{fee.title}</p>
          <p className="break-words text-xs text-muted-foreground">
            {fee.student ? `${fee.student.full_name} · Lớp ${fee.student.class_name} · ${CAMPUS_LABELS[fee.student.campus]}` : "—"}
          </p>
          <p className="mt-1 text-xs">
            <span className="font-bold tabular-nums">{formatVND(fee.amount)}</span>
            {fee.status === "partial" && <span className="text-muted-foreground"> · đã đóng {formatVND(fee.paid_amount)}</span>}
            {fee.due_date && (
              <span className={cn(overdue ? "font-semibold text-rose-600" : "text-muted-foreground")}>
                {" "}
                · hạn {fullDate(fee.due_date)}
                {overdue && " (quá hạn)"}
              </span>
            )}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", style.badge)}>{style.label}</span>
      </div>

      {editing ? (
        <div className="flex gap-2 pl-[3.25rem]">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={fee.amount}
            step={1000}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            aria-label="Số tiền đã đóng"
            className={cn(fieldClass, "h-9")}
          />
          <Button type="button" size="sm" className="h-9 rounded-lg" disabled={pending} onClick={() => run(() => recordPayment(fee.id, Number(paid)))}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pl-[3.25rem]">
          {fee.status !== "paid" && (
            <Button type="button" size="sm" className="h-8 rounded-lg" disabled={pending} onClick={() => run(() => recordPayment(fee.id, fee.amount))}>
              <CheckCheck /> Đã đóng đủ
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setEditing(true)} disabled={pending}>
            Ghi nhận số tiền
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-destructive"
            disabled={pending}
            onClick={async () => (await confirmSheet({ title: `Xoá khoản "${fee.title}"?`, confirmLabel: "Xoá khoản thu", tone: "danger" })) && run(() => deleteFee(fee.id))}
            aria-label="Xoá khoản thu"
          >
            <Trash2 />
          </Button>
        </div>
      )}
      {error && <p className="pl-[3.25rem] text-xs font-medium text-destructive">{error}</p>}
    </li>
  );
}

const FILTERS: { value: "all" | Enums<"fee_status">; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unpaid", label: "Chưa đóng" },
  { value: "partial", label: "Còn thiếu" },
  { value: "paid", label: "Đã đóng" },
];

export function FeeManager({ classes, students, fees, today }: { classes: ClassRow[]; students: StudentRow[]; fees: FeeRow[]; today: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    return fees.filter(
      (f) =>
        (filter === "all" || f.status === filter) &&
        (!q || f.title.toLocaleLowerCase("vi").includes(q) || f.student?.full_name.toLocaleLowerCase("vi").includes(q)),
    );
  }, [fees, filter, query]);

  const outstanding = fees.reduce((sum, f) => sum + (f.amount - f.paid_amount), 0);
  const collected = fees.reduce((sum, f) => sum + f.paid_amount, 0);

  return (
    <div className="space-y-5">
      {classes.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa có lớp học nào — hãy tạo lớp và thêm học sinh trước.
        </p>
      ) : (
        <CreateFeeForm classes={classes} students={students} today={today} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-100">
          <p className="text-xs font-semibold opacity-80">Đã thu</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">{formatVND(collected)}</p>
        </div>
        <div className="rounded-2xl bg-rose-50 p-4 text-rose-800 ring-1 ring-rose-100">
          <p className="text-xs font-semibold opacity-80">Còn phải thu</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">{formatVND(outstanding)}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Các khoản thu ({fees.length})</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo học sinh hoặc tên khoản thu..."
            aria-label="Tìm khoản thu"
            className={cn(fieldClass, "pl-9")}
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Không có khoản thu nào.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {visible.map((f) => (
              <FeeItem key={f.id} fee={f} today={today} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
