import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardSecret, matchesSecret } from "@/lib/security/secret-route";
import { getAnalyticsReportForCron } from "@/features/analytics/queries";
import { weeklyDigest } from "@/features/analytics/digest";

/**
 * Báo cáo doanh thu & sĩ số hằng tuần — tối Chủ nhật 20:00 giờ VN (vercel.json: "0 13 * * 0").
 *  1. Luôn: 1 mục trong Bảng tin hoạt động của quản trị viên (chuông + /admin/notifications), mở → /admin/analytics.
 *  2. Tuỳ chọn: email HTML qua Resend khi có RESEND_API_KEY + REPORT_EMAIL_FROM. Người nhận: REPORT_EMAIL_TO (danh sách,
 *     phân cách dấu phẩy) hoặc mặc định email đăng nhập của mọi tài khoản quản trị viên.
 * Xác thực: Authorization: Bearer <CRON_SECRET> (Vercel Cron tự gửi). Gọi lại cùng tuần → không tạo trùng.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  return matchesSecret(header.startsWith("Bearer ") ? header.slice(7) : "", [process.env.CRON_SECRET, process.env.PUSH_DISPATCH_SECRET]);
}

async function adminEmails(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const configured = (process.env.REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (configured.length) return configured;
  const { data: profiles } = await admin.from("profiles").select("id").eq("role", "admin");
  const ids = new Set((profiles ?? []).map((p) => p.id));
  const emails: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    for (const u of data.users) if (ids.has(u.id) && u.email) emails.push(u.email);
    if (data.users.length < 200) break;
  }
  return emails;
}

async function sendEmail(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  if (!key || !from || !to.length) return { sent: 0, skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[weekly-report] Gửi email lỗi:", res.status, (await res.text()).slice(0, 200));
    return { sent: 0, skipped: false };
  }
  return { sent: to.length, skipped: false };
}

async function handle(request: NextRequest) {
  const rejected = await guardSecret(request, authorized(request));
  if (rejected) return rejected;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "missing service role" }, { status: 500 });

  const report = await getAnalyticsReportForCron(3, 4);
  if (!report) return NextResponse.json({ error: "Chưa chạy supabase/apply-analytics.sql" }, { status: 409 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  const digest = weeklyDigest(report, appUrl);
  const admin = createAdminClient();

  // 1. Bảng tin quản trị — group_key theo tuần: chạy lại không tạo trùng
  const groupKey = `weekly-report:${digest.weekKey}`;
  const { data: existing } = await admin.from("admin_notifications").select("id").eq("group_key", groupKey).limit(1);
  let feed = "exists";
  if (!existing?.length) {
    const { error } = await admin.from("admin_notifications").insert({
      category: "summary",
      actor_id: null,
      actor_role: "system",
      actor_name: "Báo cáo tự động",
      title: digest.title,
      body: digest.body,
      href: "/admin/analytics",
      group_key: groupKey,
    });
    feed = error ? `error: ${error.message}` : "created";
  }

  // 2. Email (tuỳ chọn) — chỉ gửi khi vừa tạo mục mới (không gửi lặp khi cron chạy lại)
  const email = feed === "created" ? await sendEmail(await adminEmails(admin), digest.title, digest.html) : { sent: 0, skipped: true };
  return NextResponse.json({ ok: true, feed, email, week: digest.weekKey });
}

export const GET = handle;
export const POST = handle;
