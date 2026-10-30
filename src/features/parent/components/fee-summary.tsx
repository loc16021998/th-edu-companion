import { CalendarClock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/utils";
import { dayMonth } from "@/lib/date";
import type { Enums, Tables } from "@/types/database.types";
import { FEE_STATUS_STYLE } from "@/config/ui-styles";

type Fee = Pick<Tables<"fees">, "amount" | "paid_amount" | "status" | "due_date">;

export function summarizeFees(fees: Fee[], today: string) {
  const total = fees.reduce((s, f) => s + f.amount, 0);
  const paid = fees.reduce((s, f) => s + f.paid_amount, 0);
  const remaining = total - paid;
  const open = fees.filter((f) => f.status !== "paid");
  const overdue = open.filter((f) => f.due_date && f.due_date < today).length;
  const nextDue = open.map((f) => f.due_date).filter((d): d is string => !!d && d >= today).sort()[0] ?? null;
  const status: Enums<"fee_status"> = remaining <= 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { total, paid, remaining, overdue, nextDue, status };
}

export function FeeSummary({ summary }: { summary: ReturnType<typeof summarizeFees> }) {
  const { total, paid, remaining, overdue, nextDue, status } = summary;
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const done = status === "paid";

  return (
    <section
      className={
        done
          ? "relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 p-5 text-white shadow-lg shadow-emerald-500/25"
          : "relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-400 via-amber-400 to-yellow-400 p-5 text-white shadow-lg shadow-orange-500/25"
      }
    >
      <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full bg-white/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/90">{done ? "Đã hoàn tất học phí" : "Tổng cần đóng"}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
            {formatVND(done ? total : remaining)}
          </p>
        </div>
        <Badge className="bg-white text-xs text-slate-800 shadow-sm">{FEE_STATUS_STYLE[status].label}</Badge>
      </div>

      <div className="relative mt-4">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-white/30"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tỉ lệ đã thanh toán"
        >
          <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold text-white/90">
          <span>Đã đóng {formatVND(paid)}</span>
          <span>Tổng {formatVND(total)}</span>
        </div>
      </div>

      {(overdue > 0 || nextDue) && !done && (
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          {overdue > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-600/90 px-3 py-1">
              <TriangleAlert className="size-3.5" /> {overdue} khoản quá hạn
            </span>
          )}
          {nextDue && (
            <span className="flex items-center gap-1 rounded-full bg-white/25 px-3 py-1">
              <CalendarClock className="size-3.5" /> Hạn gần nhất {dayMonth(nextDue)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
