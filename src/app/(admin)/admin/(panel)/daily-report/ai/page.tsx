import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/features/auth/queries";
import { getAiUsageStats, getReportAiSettings, listNoteTemplates } from "@/features/daily-reports/ai-settings";
import { ReportAiAdmin } from "@/features/daily-reports/components/report-ai-admin";
import { fullDate } from "@/lib/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Trợ lý viết nhận xét" };

const ROLE_LABEL: Record<string, string> = { teacher: "Giáo viên", admin: "Quản trị" };

export default async function ReportAiAdminPage() {
  await connection();
  await requireRole("admin");
  const [settings, templates, stats] = await Promise.all([getReportAiSettings(), listNoteTemplates(), getAiUsageStats(30)]);
  const peak = Math.max(1, ...stats.daily.map((d) => d.total));
  const aiShare = stats.total ? Math.round((stats.ai / stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/daily-report" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Sổ liên lạc
        </Link>
        <h1 className="text-xl font-extrabold">Trợ lý viết nhận xét</h1>
        <p className="text-sm text-muted-foreground">
          Bật/tắt trợ lý & AI, văn phong của trung tâm, câu mẫu chung cho giáo viên và thống kê sử dụng. Quản trị viên cũng dùng trợ lý khi viết Sổ liên lạc.
        </p>
      </div>

      {!settings.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa cài đặt phần quản lý Trợ lý — chạy file <code>supabase/apply-report-ai-assistant.sql</code> trong Supabase SQL Editor. Trợ lý vẫn hoạt động
          với cài đặt mặc định.
        </p>
      ) : (
        <>
          <ReportAiAdmin settings={settings} templates={templates} aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />

          {/* Thống kê sử dụng */}
          <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-labelledby="ai-usage-title">
            <h2 id="ai-usage-title" className="font-bold">
              Sử dụng {stats.days} ngày gần nhất
            </h2>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { label: "Lượt gợi ý", value: stats.total },
                { label: "AI viết", value: stats.ai, note: stats.total ? `${aiShare}%` : null },
                { label: "Theo mẫu", value: stats.template },
              ].map((k) => (
                <div key={k.label} className="rounded-xl bg-muted/50 p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{k.label}</dt>
                  <dd className="text-2xl font-extrabold tabular-nums">
                    {k.value.toLocaleString("vi-VN")}
                    {k.note && <span className="ml-1 text-xs font-semibold text-muted-foreground">{k.note}</span>}
                  </dd>
                </div>
              ))}
            </dl>

            {stats.total === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có lượt dùng nào trong {stats.days} ngày qua.</p>
            ) : (
              <>
                <figure className="space-y-1">
                  <figcaption className="text-xs font-semibold text-muted-foreground">Lượt gợi ý mỗi ngày</figcaption>
                  <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={`Lượt gợi ý mỗi ngày, cao nhất ${peak} lượt`}>
                    {stats.daily.map((d) => (
                      <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${fullDate(d.date)}: ${d.total} lượt`}>
                        <div
                          className={cn("w-full rounded-t-[3px]", d.total ? "bg-primary" : "bg-muted")}
                          style={{ height: d.total ? `${Math.max(6, (d.total / peak) * 100)}%` : "3px" }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{fullDate(stats.daily[0]!.date)}</span>
                    <span>Hôm nay</span>
                  </div>
                </figure>

                <div className="-mx-4 overflow-x-auto px-4">
                  <table className="w-full min-w-[20rem] text-sm">
                    <caption className="sr-only">Lượt dùng theo người</caption>
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 font-semibold">Người dùng</th>
                        <th className="py-2 text-right font-semibold">Lượt</th>
                        <th className="py-2 text-right font-semibold">AI viết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.people.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2">
                            <span className="font-semibold">{p.name}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">{ROLE_LABEL[p.role] ?? ""}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{p.total}</td>
                          <td className="py-2 text-right tabular-nums">{p.ai}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

