import { Sparkles } from "lucide-react";
import type { MonthlySummary } from "../queries";

const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Nhận xét tổng kết tháng (phía phụ huynh) — chỉ bản giáo viên đã gửi. */
export function SummaryCard({ summary, monthLabel }: { summary: MonthlySummary | null; monthLabel: string }) {
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid print:shadow-none">
      <h2 className="flex items-center gap-2 font-bold">
        <Sparkles className="size-5 text-violet-600" /> Nhận xét tổng kết {monthLabel}
      </h2>
      {summary ? (
        <>
          <div className="whitespace-pre-wrap rounded-xl bg-violet-50/70 p-4 text-sm leading-relaxed text-foreground ring-1 ring-violet-100 print:bg-transparent print:p-0 print:ring-0">
            {summary.content}
          </div>
          <p className="text-xs text-muted-foreground">
            Giáo viên gửi ngày {summary.sent_at ? dateTimeFmt.format(new Date(summary.sent_at)) : "—"}
          </p>
        </>
      ) : (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Giáo viên chưa gửi nhận xét tổng kết cho tháng này. Anh/chị sẽ nhận thông báo 🔔 khi có nhận xét.
        </p>
      )}
    </section>
  );
}
