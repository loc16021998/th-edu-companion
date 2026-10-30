import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { listAllFeedback } from "@/features/feedback/queries";
import { AdminFeedbackManager } from "@/features/feedback/components/admin-feedback-manager";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";
import { getSurveyStats, recentPeriods } from "@/features/surveys/queries";
import { SurveyDashboard } from "@/features/surveys/components/survey-dashboard";

export const metadata: Metadata = { title: "Lắng nghe phụ huynh" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MIGRATION = (
  <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
    <p className="font-bold">Database chưa cập nhật</p>
    <p className="text-muted-foreground">
      Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file{" "}
      <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-voice-of-parent.sql</span> rồi bấm Run, sau đó tải lại trang.
    </p>
  </div>
);

export default async function AdminFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = params.tab === "survey" ? "survey" : "feedback";
  const tabClass = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground");

  return (
    <div className="space-y-5">
      <AdminFeedMarkRead category="feedback" />
      <div>
        <h1 className="text-xl font-extrabold">Lắng nghe phụ huynh</h1>
        <p className="text-sm text-muted-foreground">
          Góp ý, báo lỗi, thắc mắc gửi Ban Giám đốc + khảo sát hài lòng hàng tháng. Trả lời / đổi trạng thái → phụ huynh nhận thông báo ngay.
        </p>
      </div>
      <nav className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Chọn mục">
        <Link href="/admin/feedback" className={tabClass(tab === "feedback")} aria-current={tab === "feedback" ? "page" : undefined}>
          Góp ý & hỗ trợ
        </Link>
        <Link href="/admin/feedback?tab=survey" className={tabClass(tab === "survey")} aria-current={tab === "survey" ? "page" : undefined}>
          Khảo sát hài lòng
        </Link>
      </nav>
      {tab === "survey" ? <SurveyTab period={typeof params.period === "string" ? params.period : null} /> : <FeedbackTab />}
    </div>
  );
}

async function FeedbackTab() {
  const feedback = await listAllFeedback();
  return feedback.available ? <AdminFeedbackManager items={feedback.items} /> : MIGRATION;
}

async function SurveyTab({ period }: { period: string | null }) {
  const periods = recentPeriods();
  const selected = period && periods.includes(period) ? period : periods[0]!;
  const { available, stats } = await getSurveyStats(selected);
  if (!available || !stats) return MIGRATION;
  return <SurveyDashboard stats={stats} periods={periods} hrefFor={(p) => `/admin/feedback?tab=survey&period=${p}`} />;
}
