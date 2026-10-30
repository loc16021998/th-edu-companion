"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, Loader2, Phone, Search } from "lucide-react";
import { fieldClass } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { fullDate } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import { CAMPUS_COLOR, CAMPUS_LIST, monthLabel, type Campus } from "@/features/center/constants";
import { markFeePaid } from "../actions";
import type { DebtRow } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const STATUS = {
  paid: { label: "Đã hoàn thành", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  unpaid: { label: "Còn nợ", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
  partial: { label: "Đóng một phần", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
} as const;
type StatusFilter = "all" | keyof typeof STATUS | "overdue";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "paid", label: "Đã hoàn thành" },
  { value: "unpaid", label: "Còn nợ" },
  { value: "partial", label: "Đóng một phần" },
  { value: "overdue", label: "Quá hạn" },
];

function monthOf(r: DebtRow) {
  return r.period ?? (r.dueDate ? `${r.dueDate.slice(0, 7)}-01` : `${r.createdAt.slice(0, 7)}-01`);
}

/** Tổng tiền (phải thu / đã thu / còn nợ) + số khoản theo trạng thái. */
function sum(rows: DebtRow[]) {
  const acc = { billed: 0, paid: 0, owed: 0, done: 0, unpaid: 0, partial: 0 };
  for (const r of rows) {
    acc.billed += r.amount;
    acc.paid += r.paid;
    acc.owed += Math.max(r.amount - r.paid, 0);
    if (r.status === "paid") acc.done += 1;
    else if (r.status === "partial") acc.partial += 1;
    else acc.unpaid += 1;
  }
  return acc;
}

/** Tải CSV (mở được bằng Excel, giữ tiếng Việt nhờ BOM). */
function downloadCsv(rows: DebtRow[]) {
  const head = ["Cơ sở", "Lớp", "Mã HS", "Học sinh", "Phụ huynh", "SĐT", "Khoản thu", "Tháng", "Hạn", "Phải thu", "Đã thu", "Còn nợ", "Trạng thái"];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      CAMPUS_LABELS[r.student.campus],
      r.student.className,
      r.student.code ?? "",
      r.student.name,
      r.parent?.name ?? "",
      r.parent?.phone?.replace(/^\+?84/, "0") ?? "",
      r.title,
      monthLabel(monthOf(r)),
      r.dueDate ? fullDate(r.dueDate) : "",
      r.amount,
      r.paid,
      Math.max(r.amount - r.paid, 0),
      STATUS[r.status].label,
    ]
      .map(esc)
      .join(","),
  );
  const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cong-no-hoc-phi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Bảng công nợ học phí theo cơ sở → lớp → học sinh, lọc trạng thái / tháng / tìm kiếm, ghi nhận đóng đủ 1 chạm, xuất CSV. */
export function DebtBoard({ rows, today }: { rows: DebtRow[]; today: string }) {
  const router = useRouter();
  const [campus, setCampus] = useState<"all" | Campus>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const months = useMemo(() => [...new Set(rows.map(monthOf))].sort().reverse(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    return rows.filter((r) => {
      if (campus !== "all" && r.student.campus !== campus) return false;
      if (month !== "all" && monthOf(r) !== month) return false;
      if (status === "overdue") {
        if (r.status === "paid" || !r.dueDate || r.dueDate >= today) return false;
      } else if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return [r.student.name, r.student.code ?? "", r.parent?.name ?? "", r.parent?.phone ?? "", r.title].some((v) => v.toLocaleLowerCase("vi").includes(q));
    });
  }, [rows, campus, month, status, query, today]);

  const total = sum(filtered);
  const groups = useMemo(() => {
    const map = new Map<string, { campus: Campus; className: string; rows: DebtRow[] }>();
    for (const r of filtered) {
      const key = `${r.student.campus}:${r.student.className}`;
      const g = map.get(key) ?? { campus: r.student.campus, className: r.student.className, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    }
    return [...map.entries()].sort(
      ([, a], [, b]) => CAMPUS_LIST.indexOf(a.campus) - CAMPUS_LIST.indexOf(b.campus) || a.className.localeCompare(b.className, "vi", { numeric: true }),
    );
  }, [filtered]);

  async function pay(r: DebtRow) {
    if (!(await confirmSheet({ title: `Ghi nhận ${r.student.name} đã đóng đủ?`, description: `"${r.title}" — ${formatVND(r.amount)}. Phụ huynh nhận thông báo đã nhận học phí.`, confirmLabel: "Đã đóng đủ" }))) return;
    setError(null);
    setPaying(r.id);
    startTransition(async () => {
      const res = await markFeePaid(r.id);
      setPaying(null);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Phải thu", value: formatVND(total.billed), tone: "" },
          { label: "Đã thu", value: formatVND(total.paid), tone: "text-emerald-700" },
          { label: "Còn nợ", value: formatVND(total.owed), tone: "text-rose-700" },
          { label: "Số khoản", value: `${filtered.length} · ${total.unpaid} nợ · ${total.partial} một phần`, tone: "text-base" },
        ].map((c) => (
          <div key={c.label} className="min-w-0 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 text-lg font-extrabold tabular-nums leading-tight [overflow-wrap:anywhere]", c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên / mã học sinh, phụ huynh, SĐT…" aria-label="Tìm công nợ" className={cn(fieldClass, "pl-9")} />
          </div>
          <select value={campus} onChange={(e) => setCampus(e.target.value as "all" | Campus)} aria-label="Cơ sở" className={fieldClass}>
            <option value="all">Cả 2 cơ sở</option>
            {CAMPUS_LIST.map((c) => (
              <option key={c} value={c}>
                {CAMPUS_LABELS[c]}
              </option>
            ))}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng học phí" className={fieldClass}>
            <option value="all">Mọi tháng</option>
            {months.map((m) => (
              <option key={m} value={m}>
                Tháng {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                status === f.value ? "bg-slate-900 text-white ring-slate-900" : "bg-card text-muted-foreground ring-border hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-border hover:bg-muted disabled:opacity-50"
          >
            <Download className="size-3.5" /> Xuất Excel (CSV)
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Không có khoản thu phù hợp.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          {groups.map(([key, g]) => {
            const s = sum(g.rows);
            const expanded = openClass === key;
            const pct = s.billed ? Math.round((s.paid / s.billed) * 100) : 0;
            return (
              <div key={key} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenClass(expanded ? null : key)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span className="flex min-w-36 items-center gap-2 font-bold">
                    <span className="size-2.5 rounded-full" style={{ background: CAMPUS_COLOR[g.campus] }} aria-hidden />
                    Lớp {g.className}
                    <span className="text-xs font-medium text-muted-foreground">{g.campus === "CS1_XALA" ? "CS1" : "CS2"}</span>
                  </span>
                  <span className="flex min-w-32 flex-1 items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums">{pct}%</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Đã thu <b className="text-emerald-700">{formatVND(s.paid)}</b> · Còn nợ <b className="text-rose-700">{formatVND(s.owed)}</b>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.rows.length} khoản{s.unpaid ? ` · ${s.unpaid} nợ` : ""}
                    {s.partial ? ` · ${s.partial} một phần` : ""}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <ul className="divide-y bg-muted/20">
                    {g.rows.map((r) => {
                      const owed = Math.max(r.amount - r.paid, 0);
                      const overdue = r.status !== "paid" && !!r.dueDate && r.dueDate < today;
                      return (
                        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm">
                          <div className="min-w-0 flex-1 basis-60">
                            <p className="font-semibold">
                              {r.student.name}
                              {r.student.code && <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">{r.student.code}</span>}
                            </p>
                            <p className="break-words text-xs text-muted-foreground">
                              {r.title} · tháng {monthLabel(monthOf(r))}
                              {r.dueDate && <span className={cn(overdue && "font-semibold text-rose-700")}> · hạn {fullDate(r.dueDate)}</span>}
                            </p>
                            {r.parent && (
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                PH {r.parent.name}
                                {r.parent.phone && (
                                  <a href={`tel:${r.parent.phone}`} className="inline-flex items-center gap-0.5 text-primary" onClick={(e) => e.stopPropagation()}>
                                    <Phone className="size-3" /> {r.parent.phone.replace(/^\+?84/, "0")}
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", STATUS[r.status].badge)}>{STATUS[r.status].label}</span>
                          <span className="w-32 text-right tabular-nums">
                            <b>{formatVND(r.amount)}</b>
                            {owed > 0 && r.paid > 0 && <span className="block text-xs text-amber-700">còn {formatVND(owed)}</span>}
                          </span>
                          {r.status !== "paid" ? (
                            <button
                              type="button"
                              onClick={() => pay(r)}
                              disabled={paying === r.id}
                              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {paying === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Đã đóng đủ
                            </button>
                          ) : (
                            <span className="w-[6.5rem]" />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Ghi nhận đóng một phần / sửa số tiền: dùng trang Học phí (menu Vận hành).</p>
    </div>
  );
}
