"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, CircleAlert, CircleCheck, Loader2, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn, formatVND } from "@/lib/utils";
import { generateMonthlyFees } from "../actions";
import { CAMPUS_COLOR, CAMPUS_LIST, feeAfterExcused, monthLabel, perSessionPrice, previousMonth, type Campus } from "../constants";
import type { FeeGeneratorClass } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

type ScopeChoice = "all" | Campus;

/**
 * "Tạo học phí tháng" — chọn tháng, phạm vi (toàn trung tâm / từng cơ sở), học phí từng lớp
 * → 1 cú click tạo khoản thu cho mọi học sinh + gửi thông báo phụ huynh. Bé đã có khoản tháng đó được bỏ qua.
 */
export function FeeGenerator({ month, monthOptions, classes }: { month: string; monthOptions: string[]; classes: FeeGeneratorClass[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [scope, setScope] = useState<ScopeChoice>("all");
  const [title, setTitle] = useState(`Học phí tháng ${monthLabel(month)}`);
  const [dueDate, setDueDate] = useState(`${month.slice(0, 8)}10`);
  const [defaultAmount, setDefaultAmount] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(classes.map((c) => [c.id, c.monthlyFee ? String(c.monthlyFee) : ""])));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(classes.filter((c) => c.students > c.alreadyIssued).map((c) => c.id)));
  const [saveDefaults, setSaveDefaults] = useState(true);
  // Trừ buổi nghỉ có phép tháng trước (mặc định bật nếu có bé nghỉ có phép)
  const prev = previousMonth(month);
  const hasExcused = classes.some((c) => c.excusedCounts.length > 0);
  const [deduct, setDeduct] = useState(hasExcused);
  const [perSessionInput, setPerSessionInput] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const inScope = classes.filter((c) => scope === "all" || c.campus === scope);
  const amountOf = (id: string) => {
    const raw = (amounts[id] || defaultAmount).replace(/\D/g, "");
    return raw ? Number(raw) : 0;
  };
  const chosen = inScope.filter((c) => selected.has(c.id));
  const perSessionOf = (id: string) => (perSessionInput ? Number(perSessionInput) : perSessionPrice(amountOf(id), prev));
  /** Thành tiền của lớp sau khi trừ buổi nghỉ có phép (bé bị trừ hết → không phát sinh) */
  const classTotal = (c: FeeGeneratorClass) => {
    const fresh = c.students - c.alreadyIssued;
    const amount = amountOf(c.id);
    if (!deduct) return fresh * amount;
    const per = perSessionOf(c.id);
    return (fresh - c.excusedCounts.length) * amount + c.excusedCounts.reduce((sum, n) => sum + feeAfterExcused(amount, n, per), 0);
  };
  const summary = (() => {
    let students = 0;
    let skipped = 0;
    let total = 0;
    const missingAmount: string[] = [];
    for (const c of chosen) {
      const fresh = c.students - c.alreadyIssued;
      students += fresh;
      skipped += c.alreadyIssued;
      total += classTotal(c);
      if (fresh > 0 && amountOf(c.id) < 1000) missingAmount.push(c.name);
    }
    return { students, skipped, total, missingAmount };
  })();

  function changeMonth(value: string) {
    startTransition(() => router.push(`${pathname}?${new URLSearchParams({ tab: "fees", month: value })}`));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setResult(null);
    const items = chosen.filter((c) => c.students > c.alreadyIssued).map((c) => ({ classId: c.id, amount: amountOf(c.id) }));
    if (items.length === 0) return setResult({ ok: false, text: "Không có học sinh nào cần tạo học phí trong các lớp đã chọn." });
    if (summary.missingAmount.length) return setResult({ ok: false, text: `Nhập học phí cho lớp ${summary.missingAmount.join(", ")} (tối thiểu 1.000đ).` });
    if (!(await confirmSheet({ title: `Tạo "${title}" cho ${summary.students} học sinh?`, description: `Tổng ${formatVND(summary.total)}. Phụ huynh sẽ nhận thông báo ngay.`, confirmLabel: "Tạo học phí" }))) return;
    startTransition(async () => {
      const res = await generateMonthlyFees({
        month,
        title,
        dueDate: dueDate || null,
        items,
        saveDefaults,
        deductExcused: deduct ? { perSession: perSessionInput ? Number(perSessionInput) : null } : null,
      });
      if (!res.ok) return setResult({ ok: false, text: res.error });
      const { created, skipped, deducted, total } = res.data;
      setResult({
        ok: true,
        text:
          `Đã tạo ${created} khoản học phí tháng ${monthLabel(month)} (${formatVND(total)}) và gửi thông báo cho phụ huynh.` +
          (deducted ? ` ${deducted} bé được trừ buổi nghỉ có phép tháng ${monthLabel(prev)}.` : "") +
          (skipped ? ` ${skipped} bé được bỏ qua (đã có khoản tháng này hoặc nghỉ có phép cả tháng).` : ""),
      });
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <div>
        <h2 className="flex items-center gap-2 font-bold">
          <Sparkles className="size-5 text-violet-600" /> Tạo học phí tháng — 1 cú click
        </h2>
        <p className="text-sm text-muted-foreground">Tạo khoản thu cho toàn bộ học sinh các lớp đã chọn và tự gửi thông báo học phí cho phụ huynh. Bấm lại không tạo trùng.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tháng thu" htmlFor="fg-month">
          <div className="relative">
            <CalendarRange className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select id="fg-month" value={month} onChange={(e) => changeMonth(e.target.value)} className={cn(fieldClass, "pl-9 font-semibold")} disabled={pending}>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  Tháng {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Tên khoản thu" htmlFor="fg-title">
          <input id="fg-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={fieldClass} />
        </Field>
        <Field label="Hạn đóng" htmlFor="fg-due">
          <input id="fg-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Học phí chung (lớp chưa có mức riêng)" htmlFor="fg-default">
          <input
            id="fg-default"
            inputMode="numeric"
            value={defaultAmount ? Number(defaultAmount).toLocaleString("vi-VN") : ""}
            onChange={(e) => setDefaultAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="VD: 1.200.000"
            className={fieldClass}
          />
        </Field>
      </div>

      <div role="radiogroup" aria-label="Phạm vi" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {(["all", ...CAMPUS_LIST] as ScopeChoice[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scope === s}
            onClick={() => setScope(s)}
            className={cn("h-9 rounded-lg text-xs font-semibold transition-colors sm:text-sm", scope === s ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {s === "all" ? "Toàn trung tâm" : CAMPUS_LABELS[s]}
          </button>
        ))}
      </div>

      {inScope.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có lớp nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Học phí từng lớp</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-2">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả lớp"
                    className="size-4 accent-primary"
                    checked={inScope.every((c) => selected.has(c.id))}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const c of inScope) {
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <th className="p-2 font-semibold">Lớp</th>
                <th className="p-2 text-right font-semibold">Học sinh</th>
                <th className="p-2 font-semibold">Học phí / tháng</th>
                <th className="hidden p-2 text-right font-semibold sm:table-cell">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inScope.map((c) => {
                const fresh = c.students - c.alreadyIssued;
                const on = selected.has(c.id);
                return (
                  <tr key={c.id} className={cn(!on && "text-muted-foreground")}>
                    <td className="p-2">
                      <input type="checkbox" aria-label={`Chọn lớp ${c.name}`} className="size-4 accent-primary" checked={on} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="p-2">
                      <span className="flex flex-wrap items-center gap-x-2 font-semibold">
                        <span className="size-2.5 rounded-full" style={{ background: CAMPUS_COLOR[c.campus] }} aria-hidden />
                        Lớp {c.name}
                        <span className="text-xs font-normal text-muted-foreground">{c.campus === "CS1_XALA" ? "CS1" : "CS2"}</span>
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {fresh}
                      {c.alreadyIssued > 0 && <span className="block text-xs text-emerald-700">{c.alreadyIssued} đã có</span>}
                      {deduct && c.excusedCounts.length > 0 && (
                        <span className="block text-xs text-indigo-700" title={`Buổi nghỉ có phép tháng ${monthLabel(prev)}`}>
                          {c.excusedCounts.length} bé −{c.excusedCounts.reduce((a, b) => a + b, 0)} buổi
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        inputMode="numeric"
                        aria-label={`Học phí lớp ${c.name}`}
                        value={amounts[c.id] ? Number(amounts[c.id]).toLocaleString("vi-VN") : ""}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [c.id]: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                        placeholder={defaultAmount ? Number(defaultAmount).toLocaleString("vi-VN") : "Nhập học phí"}
                        className={cn(fieldClass, "h-9 w-28 text-right tabular-nums sm:w-36", on && fresh > 0 && amountOf(c.id) < 1000 && "border-amber-400")}
                        disabled={!on}
                      />
                    </td>
                    <td className="hidden p-2 text-right font-semibold tabular-nums sm:table-cell">
                      {!on || fresh === 0 ? "—" : amountOf(c.id) >= 1000 ? formatVND(classTotal(c)) : <span className="text-xs font-medium text-amber-700">Cần nhập học phí</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2 rounded-xl bg-indigo-50/60 p-3 ring-1 ring-indigo-100">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            <b>Trừ học phí các buổi “Nghỉ có phép” tháng {monthLabel(prev)}</b>
            <span className="block text-xs text-muted-foreground">
              {hasExcused
                ? `${classes.reduce((n, c) => n + c.excusedCounts.length, 0)} bé có buổi nghỉ có phép (đơn xin nghỉ được cô đồng ý).`
                : "Tháng trước chưa có bé nào nghỉ có phép."}
            </span>
          </span>
        </label>
        {deduct && (
          <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
            <span className="text-muted-foreground">Đơn giá mỗi buổi</span>
            <input
              inputMode="numeric"
              aria-label="Đơn giá mỗi buổi nghỉ có phép"
              value={perSessionInput ? Number(perSessionInput).toLocaleString("vi-VN") : ""}
              onChange={(e) => setPerSessionInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Tự tính"
              className={cn(fieldClass, "h-9 w-32 text-right tabular-nums")}
            />
            <span className="text-xs text-muted-foreground">Để trống = học phí lớp ÷ số buổi học tháng {monthLabel(prev)}</span>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saveDefaults} onChange={(e) => setSaveDefaults(e.target.checked)} className="size-4 accent-primary" />
        Lưu mức học phí làm mặc định cho các lớp (tháng sau tự điền sẵn)
      </label>

      <div className="flex flex-col gap-3 rounded-xl bg-violet-50 p-3 ring-1 ring-violet-200 sm:flex-row sm:items-center">
        <div className="flex-1 text-sm">
          <p className="font-semibold text-violet-950">
            {chosen.length} lớp · {summary.students} học sinh · tổng <span className="tabular-nums">{formatVND(summary.total)}</span>
          </p>
          {summary.skipped > 0 && <p className="text-xs text-violet-900/80">{summary.skipped} bé đã có học phí tháng {monthLabel(month)} — sẽ bỏ qua.</p>}
        </div>
        <Button type="button" className="h-11 rounded-xl bg-violet-600 hover:bg-violet-700" onClick={submit} disabled={pending || summary.students === 0}>
          {pending ? <Loader2 className="animate-spin" /> : <Wallet />}
          {pending ? "Đang tạo..." : "Tạo học phí & gửi thông báo"}
        </Button>
      </div>

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
    </section>
  );
}
