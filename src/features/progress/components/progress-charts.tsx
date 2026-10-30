"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDownRight, ArrowUpRight, Minus, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceMonth, SubjectProgress } from "../queries";

// Phần vẽ (recharts ~117kB gzip) nạp sau khi trang đã hiện; khung có chiều cao cố định nên không nhảy bố cục.
const chartLoading = () => <div className="size-full animate-pulse rounded-xl bg-muted/60" aria-hidden />;
const AttendanceBars = dynamic(() => import("./progress-charts-draw").then((m) => m.AttendanceBars), { ssr: false, loading: chartLoading });
const SubjectLines = dynamic(() => import("./progress-charts-draw").then((m) => m.SubjectLines), { ssr: false, loading: chartLoading });

/** Số thập phân kiểu Việt Nam, 1 chữ số: 4 → "4,0" */
const vn1 = (n: number) => n.toFixed(1).replace(".", ",");

function TableToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:bg-muted print:hidden"
    >
      <Table2 className="size-3.5" /> {open ? "Ẩn bảng số liệu" : "Xem bảng số liệu"}
    </button>
  );
}

// ============================================================================ Chuyên cần theo tháng

export function AttendanceChart({ data, readOnly = false }: { data: AttendanceMonth[]; /** Phụ huynh: chỉ xem, không có nút */ readOnly?: boolean }) {
  const [table, setTable] = useState(false);
  const hasData = data.some((d) => d.present + d.late + d.absent + d.excused > 0);

  return (
    <div className="space-y-3">
      {hasData ? (
        <div className="h-60 w-full sm:h-64" role="img" aria-label="Biểu đồ số buổi có mặt, đi muộn, nghỉ theo tháng">
          <AttendanceBars data={data} />
        </div>
      ) : (
        <p className="rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu điểm danh trong 6 tháng gần đây.</p>
      )}

      {hasData && !readOnly && (
        <div className="flex justify-end">
          <TableToggle open={table} onClick={() => setTable((v) => !v)} />
        </div>
      )}
      {table && hasData && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Tháng</th>
                <th className="px-3 py-2 text-right font-semibold">Có mặt</th>
                <th className="px-3 py-2 text-right font-semibold">Đi muộn</th>
                <th className="px-3 py-2 text-right font-semibold">Nghỉ</th>
                <th className="px-3 py-2 text-right font-semibold">Có phép</th>
                <th className="px-3 py-2 text-right font-semibold">Chuyên cần</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {data.map((d) => (
                <tr key={d.month}>
                  <td className="px-3 py-1.5 font-medium">{d.label}</td>
                  <td className="px-3 py-1.5 text-right">{d.present}</td>
                  <td className="px-3 py-1.5 text-right">{d.late}</td>
                  <td className="px-3 py-1.5 text-right">{d.absent}</td>
                  <td className="px-3 py-1.5 text-right">{d.excused}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{d.rate === null ? "—" : `${d.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================ Tiến bộ từng môn

function Delta({ avg, prevAvg }: { avg: number | null; prevAvg: number | null }) {
  if (avg === null || prevAvg === null) return <span className="text-xs text-muted-foreground">—</span>;
  const d = Math.round((avg - prevAvg) * 10) / 10;
  if (d === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
        <Minus className="size-3" /> Giữ nguyên
      </span>
    );
  const up = d > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-emerald-700" : "text-rose-700")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "Tiến bộ" : "Giảm"} {up ? "+" : ""}
      {vn1(d)}
    </span>
  );
}

/** Biểu đồ + trung bình tháng của 1 môn. `allowTable`: có nút "Xem bảng số liệu". */
function SubjectBody({ subject, monthLabel, allowTable }: { subject: SubjectProgress; monthLabel: string; allowTable: boolean }) {
  const [table, setTable] = useState(false);

  const hasWeekly = subject.weekly.some((w) => subject.criteria.some((c) => typeof w[c.key] === "number") || typeof w.overall === "number");
  // Mobile: tối đa 8 tuần gần nhất cho thoáng; in / màn hình rộng: đủ 12 tuần (CSS điều khiển bằng 2 biểu đồ)
  const weeklyMobile = subject.weekly.slice(-8);

  const chart = (data: SubjectProgress["weekly"]) => <SubjectLines criteria={subject.criteria} data={data} />;

  return (
    <div className="space-y-4">

      {hasWeekly ? (
        <>
          <div className="h-64 w-full sm:hidden print:hidden" role="img" aria-label={`Tiến bộ môn ${subject.name} theo tuần`}>
            {chart(weeklyMobile)}
          </div>
          <div className="hidden h-72 w-full sm:block print:block" role="img" aria-label={`Tiến bộ môn ${subject.name} theo tuần`}>
            {chart(subject.weekly)}
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          Chưa có đánh giá chi tiết môn {subject.name} trong 12 tuần gần đây.
        </p>
      )}

      {/* Trung bình tháng từng tiêu chí, so với tháng trước */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Trung bình {monthLabel} (so với tháng trước)</p>
        <ul className="space-y-2">
          {[...subject.month, { key: "overall", label: "Điểm chung của môn", avg: subject.overall.avg, prevAvg: subject.overall.prevAvg, count: 0 }].map((c) => (
            <li key={c.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="flex items-center gap-2">
                  <Delta avg={c.avg} prevAvg={c.prevAvg} />
                  <b className="w-12 text-right tabular-nums">{c.avg === null ? "—" : `${vn1(c.avg)}/5`}</b>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${((c.avg ?? 0) / 5) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {allowTable && hasWeekly && (
        <div className="flex justify-end">
          <TableToggle open={table} onClick={() => setTable((v) => !v)} />
        </div>
      )}
      {allowTable && table && hasWeekly && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Tuần từ</th>
                {subject.criteria.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right font-semibold">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Điểm chung</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {subject.weekly.map((w) => (
                <tr key={w.week}>
                  <td className="px-3 py-1.5 font-medium">{w.label}</td>
                  {subject.criteria.map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right">
                      {typeof w[c.key] === "number" ? vn1(w[c.key] as number) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right">{typeof w.overall === "number" ? vn1(w.overall) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Tiến bộ từng môn.
 *  - Mặc định (giáo viên / quản trị): tab chọn môn + nút xem bảng số liệu.
 *  - `readOnly` (phụ huynh): CHỈ XEM — hiện cả 3 môn liền nhau, không tab, không nút bấm.
 */
export function SubjectProgressChart({
  subjects,
  monthLabel,
  readOnly = false,
}: {
  subjects: SubjectProgress[];
  monthLabel: string;
  readOnly?: boolean;
}) {
  const [active, setActive] = useState(subjects[0]?.key);
  const subject = subjects.find((s) => s.key === active) ?? subjects[0];
  if (!subject) return null;

  if (readOnly) {
    return (
      <div className="space-y-6">
        {subjects.map((s) => (
          <div key={s.key} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0 print:break-inside-avoid">
            <h3 className="text-sm font-bold">{s.name}</h3>
            <SubjectBody subject={s} monthLabel={monthLabel} allowTable={false} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Chọn môn" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 print:hidden">
        {subjects.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === subject.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "h-9 rounded-lg px-1 text-xs font-semibold transition-colors sm:text-sm",
              s.key === subject.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <p className="hidden text-sm font-bold print:block">{subject.name}</p>
      <SubjectBody key={subject.key} subject={subject} monthLabel={monthLabel} allowTable />
    </div>
  );
}
