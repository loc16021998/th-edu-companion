import "server-only";
import { after } from "next/server";
import { todayVN } from "@/lib/date";
import { createAdminClient } from "@/lib/supabase/admin";
import { outboundConfig, sendOutbound } from "@/lib/messaging/outbound";
import { pushConfigured, sendPushToUsers, type PushPayload } from "@/lib/push/server";
import { notificationHref } from "@/features/notifications/format";

/** Chỉ đẩy thông báo mới (tránh gửi lại hàng loạt thông báo cũ khi vừa bật tính năng). */
const MAX_AGE_MINUTES = 60;
/** Quá nhiều thông báo cùng lúc cho 1 người → gộp thành 1 push tóm tắt. */
const COLLAPSE_AFTER = 3;

/**
 * Gửi Web Push (và tin Zalo ZNS / SMS qua webhook nếu bật) cho các thông báo chưa gửi (`notifications.pushed_at` null).
 * Mỗi thông báo được "giữ chỗ" bằng cách đặt pushed_at trước khi gửi → gọi song song không gửi trùng.
 * Gọi sau các thao tác sinh thông báo (điểm danh, sổ liên lạc, đơn nghỉ…) hoặc từ webhook/cron /api/push/dispatch.
 */
export async function deliverPendingNotifications(opts: { recipientIds?: string[] } = {}): Promise<{ pushed: number; outbound: number }> {
  const out = outboundConfig();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || (!pushConfigured() && !out.enabled)) return { pushed: 0, outbound: 0 };
  const admin = createAdminClient();

  let query = admin
    .from("notifications")
    .select("id, recipient_id, student_id, type, ref_date, ref_id, title, body")
    .is("pushed_at", null)
    .gte("created_at", new Date(Date.now() - MAX_AGE_MINUTES * 60_000).toISOString())
    .order("created_at")
    .limit(300);
  if (opts.recipientIds?.length) query = query.in("recipient_id", [...new Set(opts.recipientIds)]);
  const { data: pending, error } = await query;
  if (error) {
    // Chưa chạy migration (thiếu cột pushed_at) → bỏ qua
    if (!["42703", "PGRST204", "PGRST205"].includes(error.code)) console.error("[push] Không đọc được thông báo chờ gửi:", error);
    return { pushed: 0, outbound: 0 };
  }
  if (pending.length === 0) return { pushed: 0, outbound: 0 };

  const { data: claimed, error: claimError } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", pending.map((n) => n.id))
    .is("pushed_at", null)
    .select("id");
  if (claimError) {
    console.error("[push] Không đánh dấu được thông báo:", claimError);
    return { pushed: 0, outbound: 0 };
  }
  const mine = new Set(claimed.map((c) => c.id));
  const items = pending.filter((n) => mine.has(n.id));
  const today = todayVN();
  // Vai trò người nhận → đường dẫn đúng khu (phụ huynh / giáo viên / quản trị — vd. lịch hẹn với Ban quản lý)
  const { data: roleRows } = await admin.from("profiles").select("id, role").in("id", [...new Set(items.map((n) => n.recipient_id))]);
  const roleOf = new Map((roleRows ?? []).map((r) => [r.id, r.role === "teacher" || r.role === "admin" ? r.role : ("parent" as const)]));
  const inboxOf = (recipient: string) => ({ teacher: "/teacher/notifications", admin: "/admin/consultations", parent: "/parent/notifications" })[roleOf.get(recipient) ?? "parent"];

  // ---- Web Push
  let pushed = 0;
  const byRecipient = new Map<string, typeof items>();
  for (const n of items) byRecipient.set(n.recipient_id, [...(byRecipient.get(n.recipient_id) ?? []), n]);
  await Promise.all(
    [...byRecipient.entries()].map(async ([recipient, list]) => {
      const payloads: PushPayload[] =
        list.length > COLLAPSE_AFTER
          ? [
              {
                title: `TH EDU: ${list.length} thông báo mới`,
                body: list
                  .slice(-3)
                  .map((n) => n.title)
                  .join(" · "),
                url: inboxOf(recipient),
                tag: "thedu-summary",
              },
            ]
          : list.map((n) => ({ title: n.title, body: n.body, url: notificationHref(n, today, roleOf.get(n.recipient_id)), tag: `${n.type}:${n.ref_id ?? n.student_id}:${n.ref_date}` }));
      for (const p of payloads) pushed += await sendPushToUsers([recipient], () => p);
    }),
  );

  // ---- Zalo ZNS / SMS (chỉ các loại sự kiện được bật, chỉ phụ huynh có SĐT)
  let outbound = 0;
  const outItems = out.enabled ? items.filter((n) => out.events.has(n.type)) : [];
  if (outItems.length) {
    const { data: recipients } = await admin
      .from("profiles")
      .select("id, phone, role")
      .in("id", [...new Set(outItems.map((n) => n.recipient_id))]);
    const phoneOf = new Map((recipients ?? []).filter((r) => r.role === "parent" && r.phone).map((r) => [r.id, r.phone!]));
    for (const n of outItems) {
      const phone = phoneOf.get(n.recipient_id);
      if (!phone) continue;
      const res = await sendOutbound({
        channels: out.channels,
        to: phone.startsWith("+") ? phone : `+${phone}`,
        template: n.type,
        params: { title: n.title, body: n.body, date: n.ref_date },
        idempotencyKey: `notification:${n.id}`,
        meta: { notification_id: n.id, student_id: n.student_id, ref_id: n.ref_id },
      });
      if (res.ok) outbound += 1;
    }
  }
  return { pushed, outbound };
}

/** Lên lịch gửi push NGAY SAU khi phản hồi xong (không làm chậm thao tác). Dùng trong Server Action / Route Handler. */
export function schedulePushDelivery(recipientIds?: string[]) {
  after(async () => {
    try {
      await deliverPendingNotifications({ recipientIds });
    } catch (err) {
      console.error("[push] Gửi thông báo nền thất bại:", err);
    }
  });
}
