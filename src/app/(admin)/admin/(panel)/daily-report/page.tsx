import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { DailyReportScreen } from "@/features/teacher/screens/daily-report-screen";

export const metadata: Metadata = { title: "Sổ liên lạc" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-4">
      {/* Quản trị: bật/tắt trợ lý & AI, văn phong, câu mẫu chung, thống kê */}
      <Link
        href="/admin/daily-report/ai"
        className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-50 to-sky-50 p-3 ring-1 ring-violet-200 hover:ring-violet-300 dark:from-violet-950/40 dark:to-sky-950/30 dark:ring-violet-900"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Quản lý Trợ lý viết nhận xét</span>
          <span className="block text-xs text-muted-foreground">Bật/tắt AI, văn phong trung tâm, câu mẫu chung cho giáo viên, thống kê sử dụng</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>
      <DailyReportScreen params={await searchParams} basePath="/admin/daily-report" />
    </div>
  );
}
