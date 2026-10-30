import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardSecret, matchesSecret } from "@/lib/security/secret-route";
import { deliverPendingNotifications } from "@/features/push/deliver";

/**
 * Nhắc lịch hẹn trước ~30 phút qua cron NGOÀI (gọi mỗi 5 phút) — dùng khi Supabase không bật được pg_cron.
 * Xác thực: Authorization: Bearer <CRON_SECRET hoặc PUSH_DISPATCH_SECRET>.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return matchesSecret(token, [process.env.CRON_SECRET, process.env.PUSH_DISPATCH_SECRET]);
}

async function handle(request: NextRequest) {
  const rejected = await guardSecret(request, authorized(request));
  if (rejected) return rejected;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "missing service role" }, { status: 500 });
  const { data, error } = await createAdminClient().rpc("send_consultation_reminders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pushed = await deliverPendingNotifications();
  return NextResponse.json({ ok: true, reminders: data ?? 0, ...pushed });
}

export const GET = handle;
export const POST = handle;
