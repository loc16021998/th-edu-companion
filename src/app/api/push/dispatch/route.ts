import { NextResponse, type NextRequest } from "next/server";
import { deliverPendingNotifications } from "@/features/push/deliver";
import { guardSecret, matchesSecret } from "@/lib/security/secret-route";

/**
 * Điểm gọi gửi thông báo đang chờ (Web Push + Zalo ZNS/SMS).
 * Dùng cho: Supabase Database Webhook (bảng notifications, sự kiện INSERT/UPDATE) hoặc cron mỗi phút
 * — để cả các thông báo sinh ngoài app (SQL, trigger khác) cũng được đẩy đi.
 * Xác thực: header `Authorization: Bearer <PUSH_DISPATCH_SECRET>` (hoặc CRON_SECRET của Vercel Cron).
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (request.headers.get("x-webhook-secret") ?? "");
  return matchesSecret(token, [process.env.PUSH_DISPATCH_SECRET, process.env.CRON_SECRET]);
}

async function handle(request: NextRequest) {
  const rejected = await guardSecret(request, authorized(request));
  if (rejected) return rejected;
  const result = await deliverPendingNotifications();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = handle;
export const GET = handle;
