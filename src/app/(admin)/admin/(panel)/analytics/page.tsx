import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAnalyticsReport } from "@/features/analytics/queries";
import {
  attendanceSeries,
  classesNeedingAttention,
  deriveKpis,
  fillRates,
  revenueSeries,
  studentSeries,
  subjectEnrollment,
  subjectTrend,
} from "@/features/analytics/derive";
import { CampusComparison, ClassesAttention, KpiTiles, SubjectFill } from "@/features/analytics/components/analytics-sections";
import { AnalyticsCharts } from "@/features/analytics/components/analytics-charts";
import { PrintButton } from "@/features/progress/components/print-button";

export const metadata: Metadata = { title: "Phân tích vận hành" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const months = params.months === "6" ? 6 : 12;
  const report = await getAnalyticsReport(months, 12);

  if (!report) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Phân tích vận hành</h1>
        <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
          <p className="font-bold">Database chưa có hàm báo cáo</p>
          <p className="text-muted-foreground">
            Chạy file <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-analytics.sql</span> trong Supabase SQL Editor rồi tải lại trang.
          </p>
        </div>
      </div>
    );
  }

  const k = deriveKpis(report);
  const updated = new Date(report.generated_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  const emailOn = Boolean(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM);
  const tab = (m: number) =>
    cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", months === m ? "bg-card shadow-sm" : "text-muted-foreground");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Phân tích vận hành</h1>
          <p className="text-sm text-muted-foreground">
            TH EDU · CS1 Xa La & CS2 Ngô Thì Nhậm · số liệu cập nhật {updated} (tự làm mới 10 phút / lần)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <nav className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Khoảng thời gian">
            <Link href="/admin/analytics?months=6" className={tab(6)} aria-current={months === 6 ? "page" : undefined}>
              6 tháng
            </Link>
            <Link href="/admin/analytics" className={tab(12)} aria-current={months === 12 ? "page" : undefined}>
              12 tháng
            </Link>
          </nav>
          <Button asChild className="h-9 rounded-full bg-emerald-600 hover:bg-emerald-600/90">
            <a href={`/admin/analytics/export?months=${months}`} download>
              <FileSpreadsheet /> Xuất Excel
            </a>
          </Button>
          <PrintButton fileName={`Bao-cao-tong-ket-TH-EDU-${report.today}`} />
        </div>
      </div>

      <KpiTiles k={k} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CampusComparison report={report} />
        <SubjectFill fill={fillRates(report)} enrollment={subjectEnrollment(report)} />
      </div>

      <AnalyticsCharts
        revenue={revenueSeries(report)}
        students={studentSeries(report)}
        attendance={attendanceSeries(report)}
        subjects={subjectTrend(report)}
        hasLeads={Boolean(report.interest)}
      />

      <ClassesAttention classes={classesNeedingAttention(report)} />

      <section className="flex flex-wrap items-start gap-3 rounded-3xl bg-card p-4 text-sm shadow-sm ring-1 ring-border print:hidden">
        <Mail className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold">Báo cáo tự động mỗi tối Chủ nhật (20:00)</p>
          <p className="text-muted-foreground">
            Doanh thu tuần, sĩ số, chuyên cần, tuyển sinh, lớp cần chú ý → Bảng tin hoạt động của quản trị viên
            {emailOn ? " + email tới quản trị viên." : ". Gửi thêm email: đặt RESEND_API_KEY + REPORT_EMAIL_FROM trên Vercel (xem docs/deployment.md)."}
          </p>
        </div>
      </section>
    </div>
  );
}
