import { NextResponse, type NextRequest } from "next/server";
import { runHealthChecks, type HealthReport } from "@/lib/monitoring/health";
import { guardSecret, matchesSecret } from "@/lib/security/secret-route";

/**
 * GET /api/health — trạng thái sẵn sàng phục vụ (cho UptimeRobot / Better Stack / Vercel Cron…).
 *  - 200 { status: "ok" } khi Database + Auth + Storage đều hoạt động; 503 khi "degraded" (vd. Storage lỗi → phụ huynh
 *    không xem được ảnh) hoặc "down" (Database lỗi).
 *  - Công khai: chỉ trạng thái + độ trễ, KHÔNG có thông điệp lỗi / cấu hình.
 *  - Chi tiết: Authorization: Bearer <HEALTH_CHECK_SECRET | CRON_SECRET> → kèm lỗi từng bước, phiên bản, uptime.
 * HEAD /api/health: chỉ mã trạng thái (nhẹ nhất cho máy giám sát).
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, max-age=0" };

/** Gọi công khai dồn dập (nhiều máy giám sát / bị spam) → dùng lại kết quả trong 10 giây, không bắn liên tục vào Supabase. */
const PUBLIC_CACHE_MS = 10_000;
let cached: { at: number; report: Promise<HealthReport> } | null = null;
function cachedReport() {
  if (!cached || Date.now() - cached.at > PUBLIC_CACHE_MS) cached = { at: Date.now(), report: runHealthChecks() };
  return cached.report;
}

function publicView(r: HealthReport) {
  const strip = (c: HealthReport["checks"][keyof HealthReport["checks"]]) => ({ status: c.status, latencyMs: c.latencyMs });
  return {
    status: r.status,
    checkedAt: r.checkedAt,
    checks: { database: strip(r.checks.database), auth: strip(r.checks.auth), storage: strip(r.checks.storage) },
  };
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let detailed = false;
  if (token) {
    const rejected = await guardSecret(request, matchesSecret(token, [process.env.HEALTH_CHECK_SECRET, process.env.CRON_SECRET]));
    if (rejected) return rejected;
    detailed = true;
  }
  const report = detailed ? await runHealthChecks() : await cachedReport();
  return NextResponse.json(detailed ? report : publicView(report), { status: report.status === "ok" ? 200 : 503, headers: HEADERS });
}

export async function HEAD() {
  const report = await cachedReport();
  return new NextResponse(null, { status: report.status === "ok" ? 200 : 503, headers: HEADERS });
}
