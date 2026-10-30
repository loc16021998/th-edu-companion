import "server-only";
import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push (chuẩn VAPID — chạy trên Chrome/Android, Edge, Firefox, Safari iOS 16.4+ khi đã "Thêm vào MH chính").
 * Biến môi trường: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… hoặc https://…).
 * Tạo khoá: `npx web-push generate-vapid-keys`.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Trang mở khi chạm thông báo (đường dẫn nội bộ) */
  url: string;
  /** Thông báo cùng tag thay thế nhau trên máy (vd. 1 cuộc trò chuyện) */
  tag?: string;
};

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) return (configured = false);
  try {
    setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@thedu.vn", publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error("[push] Khoá VAPID không hợp lệ:", err);
    configured = false;
  }
  return configured;
}

/**
 * Gửi push tới mọi thiết bị đã bật thông báo của các người dùng. Thiết bị hết hạn (404/410) tự bị xoá.
 * Trả về số thiết bị nhận thành công. Không cấu hình VAPID / service role → bỏ qua.
 */
export async function sendPushToUsers(userIds: string[], payloadFor: (userId: string) => PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  const admin = createAdminClient();
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", [...new Set(userIds)]);
  if (error) {
    if (error.code !== "PGRST205") console.error("[push] Không đọc được thiết bị:", error);
    return 0;
  }

  const expired: string[] = [];
  const delivered: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payloadFor(s.user_id)),
          { TTL: 60 * 60 * 24, urgency: "high", timeout: 8000 },
        );
        delivered.push(s.id);
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) expired.push(s.id);
        else console.warn("[push] Gửi thất bại:", err instanceof Error ? err.message : err);
      }
    }),
  );
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  if (delivered.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", delivered);
  return delivered.length;
}
