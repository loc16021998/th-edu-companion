"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { addMonths } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import { CAMPUS_LIST, monthLabel, type Campus } from "@/features/center/constants";
import { createBulkFees } from "../actions";
import { confirmSheet } from "@/components/ui/confirm-sheet";

export type InvoiceClass = { id: string; campus: Campus; name: string; monthlyFee: number | null };
export type InvoiceStudent = { id: string; name: string; code: string | null; campus: Campus; className: string };

/**
 * Tạo hóa đơn hàng loạt: chọn lớp → tick học sinh (mặc định cả lớp) → số tiền + hạn thanh toán (+ tháng học phí).
 * Phụ huynh nhận ngay thông báo học phí (+ push) và nút "Thanh toán ngay" (VietQR) ở mục Học phí.
 */
export function BulkInvoice({ classes, students, today }: { classes: InvoiceClass[]; students: InvoiceStudent[]; today: string }) {
  const router = useRouter();
  const nextMonth = addMonths(`${today.slice(0, 7)}-01`, 1);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const cls = classes.find((c) => c.id === classId) ?? null;
  const roster = useMemo(() => (cls ? students.filter((s) => s.campus === cls.campus && s.className === cls.name) : []), [cls, students]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(roster.map((s) => s.id)));
  const [month, setMonth] = useState(nextMonth);
  const [isMonthly, setIsMonthly] = useState(true);
  const [title, setTitle] = useState(`Học phí tháng ${monthLabel(nextMonth)}`);
  const [amount, setAmount] = useState(cls?.monthlyFee ? String(cls.monthlyFee) : "");
  const [dueDate, setDueDate] = useState(`${nextMonth.slice(0, 8)}10`);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseClass(id: string) {
    setClassId(id);
    const c = classes.find((x) => x.id === id);
    setPicked(new Set(students.filter((s) => c && s.campus === c.campus && s.className === c.name).map((s) => s.id)));
    if (c?.monthlyFee) setAmount(String(c.monthlyFee));
    setResult(null);
  }

  function chooseMonth(m: string) {
    setMonth(m);
    setTitle(`Học phí tháng ${monthLabel(m)}`);
    setDueDate(`${m.slice(0, 8)}10`);
  }

  const amountNum = Number(amount || 0);
  const selected = roster.filter((s) => picked.has(s.id));

  async function submit() {
    setResult(null);
    if (selected.length === 0) return setResult({ ok: false, text: "Chọn ít nhất một học sinh." });
    if (amountNum < 1000) return setResult({ ok: false, text: "Nhập số tiền học phí (tối thiểu 1.000đ)." });
    if (!dueDate) return setResult({ ok: false, text: "Chọn hạn thanh toán." });
    if (!(await confirmSheet({ title: `Tạo "${title}" cho ${selected.length} học sinh lớp ${cls?.name}?`, description: `${formatVND(amountNum)} / học sinh. Phụ huynh nhận thông báo ngay.`, confirmLabel: "Tạo hoá đơn" }))) return;
    startTransition(async () => {
      const res = await createBulkFees({ studentIds: selected.map((s) => s.id), title, amount: amountNum, dueDate, period: isMonthly ? month : null });
      if (!res.ok) return setResult({ ok: false, text: res.error });
      setResult({
        ok: true,
        text:
          `Đã tạo ${res.data.created} hóa đơn (${formatVND(res.data.total)}) và gửi thông báo cho phụ huynh.` +
          (res.data.skipped ? ` ${res.data.skipped} bé đã có học phí tháng ${monthLabel(month)} nên được bỏ qua.` : ""),
      });
      router.refresh();
    });
  }

  const monthOptions = [-1, 0, 1, 2].map((d) => addMonths(`${today.slice(0, 7)}-01`, d));

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <ReceiptText className="size-5 text-primary" /> Tạo hóa đơn hàng loạt
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Lớp" htmlFor="bi-class">
          <select id="bi-class" value={classId} onChange={(e) => chooseClass(e.target.value)} className={fieldClass}>
            {CAMPUS_LIST.map((campus) => (
              <optgroup key={campus} label={CAMPUS_LABELS[campus]}>
                {classes
                  .filter((c) => c.campus === campus)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Tháng học phí" htmlFor="bi-month">
          <select id="bi-month" value={month} onChange={(e) => chooseMonth(e.target.value)} className={fieldClass} disabled={!isMonthly}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                Tháng {monthLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số tiền mỗi học sinh" htmlFor="bi-amount">
          <input
            id="bi-amount"
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="VD: 1.200.000"
            className={cn(fieldClass, "text-right tabular-nums")}
          />
        </Field>
        <Field label="Hạn thanh toán" htmlFor="bi-due">
          <input id="bi-due" type="date" value={dueDate} min={today} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
        </Field>
      </div>
      <Field label="Tên khoản thu" htmlFor="bi-title">
        <input id="bi-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={isMonthly} onChange={(e) => setIsMonthly(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          Là học phí tháng {monthLabel(month)} — <span className="text-muted-foreground">mỗi bé chỉ 1 hóa đơn / tháng, bé đã có sẽ được bỏ qua. Bỏ tick cho khoản lẻ (sách vở, ngoại khoá…).</span>
        </span>
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            Học sinh ({selected.length}/{roster.length})
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => setPicked(selected.length === roster.length ? new Set() : new Set(roster.map((s) => s.id)))}
          >
            {selected.length === roster.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
        </div>
        {roster.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Lớp chưa có học sinh.</p>
        ) : (
          <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-xl bg-muted/40 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((s) => (
              <li key={s.id}>
                <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-background", picked.has(s.id) && "bg-background ring-1 ring-primary/30")}>
                  <input
                    type="checkbox"
                    checked={picked.has(s.id)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1 break-words">{s.name}</span>
                  {s.code && <span className="font-mono text-xs text-muted-foreground">{s.code}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/15 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm">
          {selected.length} hóa đơn × {formatVND(amountNum)} = <b className="tabular-nums">{formatVND(selected.length * amountNum)}</b>
        </p>
        <Button type="button" className="h-11 rounded-xl" onClick={submit} disabled={pending || selected.length === 0}>
          {pending ? <Loader2 className="animate-spin" /> : <ReceiptText />} Tạo hóa đơn & báo phụ huynh
        </Button>
      </div>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={cn("flex items-start gap-2 rounded-xl p-3 text-sm font-medium", result.ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-destructive/10 text-destructive")}
        >
          {result.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          {result.text}
        </p>
      )}
    </section>
  );
}
