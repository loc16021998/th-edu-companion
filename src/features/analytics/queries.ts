import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsReport } from "./derive";

export const ANALYTICS_TAG = "analytics";
const isMissing = (code: string) => ["PGRST202", "42883", "PGRST205", "42P01"].includes(code);

async function run(client: { rpc: ReturnType<typeof createAdminClient>["rpc"] }, months: number, weeks: number) {
  const { data, error } = await client.rpc("analytics_report", { p_months: months, p_weeks: weeks });
  if (error) {
    if (isMissing(error.code)) return null;
    throw new Error("Không tạo được báo cáo phân tích", { cause: error });
  }
  return data as unknown as AnalyticsReport;
}

/**
 * Báo cáo tổng hợp (SQL gom nhóm trong Postgres). Dùng chung giữa các quản trị viên trong 10 phút
 * (số liệu điều hành, không cần tức thời) → mở trang / xuất Excel không chạy lại truy vấn nặng.
 * GỌI SAU requireRole("admin") — bản cache chạy bằng service role.
 */
const cachedReport = unstable_cache((months: number, weeks: number) => run(createAdminClient(), months, weeks), ["analytics-report"], {
  revalidate: 600,
  tags: [ANALYTICS_TAG],
});

export async function getAnalyticsReport(months = 12, weeks = 12): Promise<AnalyticsReport | null> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return cachedReport(months, weeks);
  // Không có service role → chạy bằng phiên quản trị viên (RPC tự kiểm tra quyền), không cache
  return run(await createClient(), months, weeks);
}

/** Báo cáo cho cron (không có phiên đăng nhập) — luôn tính mới bằng service role. */
export function getAnalyticsReportForCron(months = 3, weeks = 4) {
  return run(createAdminClient(), months, weeks);
}
