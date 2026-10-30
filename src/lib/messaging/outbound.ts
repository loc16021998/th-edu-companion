import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cổng gửi tin ra ngoài ứng dụng — chuẩn hoá sẵn để nối Zalo ZNS / SMS (OTP, nhắc học phí…).
 *
 * App KHÔNG gọi thẳng API Zalo/SMS: mọi tin được POST (JSON, ký HMAC-SHA256) tới MỘT webhook do bạn cấu hình
 * (`MESSAGING_WEBHOOK_URL`) — vd. một Edge Function / n8n / Make / dịch vụ của nhà cung cấp ZNS — nơi đó
 * map `template` → mã mẫu ZNS đã duyệt (hoặc nội dung SMS) rồi gọi nhà cung cấp.
 * Chưa cấu hình → bỏ qua (không lỗi), app vẫn chạy bình thường.
 *
 * Biến môi trường:
 *   MESSAGING_WEBHOOK_URL      https://… (bắt buộc để bật)
 *   MESSAGING_WEBHOOK_SECRET   chuỗi bí mật ≥ 32 ký tự để ký HMAC (bắt buộc)
 *   MESSAGING_CHANNELS         "zalo_zns" | "sms" | "zalo_zns,sms" (mặc định "zalo_zns")
 *   MESSAGING_EVENTS           loại sự kiện được gửi ra ngoài, vd "attendance,fee_issued,leave_decided"
 *
 * Bên nhận kiểm tra chữ ký: HMAC_SHA256(secret, `${timestamp}.${rawBody}`) = header X-THEDU-Signature (hex, tiền tố "sha256="),
 * và X-THEDU-Timestamp không lệch quá 5 phút — xem `verifyOutboundSignature`.
 */

export type OutboundChannel = "zalo_zns" | "sms";

export type OutboundMessage = {
  /** Kênh ưu tiên; bên nhận có thể tự fallback ZNS → SMS */
  channels: OutboundChannel[];
  /** SĐT người nhận dạng E.164 (+84…) */
  to: string;
  /** Khoá mẫu tin trung lập: "attendance", "daily_report", "fee_issued", "leave_decided", "announcement", "otp"… */
  template: string;
  /** Tham số điền vào mẫu (ZNS template_data / nội dung SMS) — chỉ chuỗi */
  params: Record<string, string>;
  /** Khoá chống gửi trùng (bên nhận nên bỏ qua nếu đã xử lý) */
  idempotencyKey: string;
  /** Thông tin tham chiếu nội bộ, không hiển thị cho người nhận */
  meta?: Record<string, string | null>;
};

export type OutboundResult = { ok: true; status: number } | { ok: false; skipped: true; reason: string } | { ok: false; skipped: false; error: string };

const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;

export function outboundConfig() {
  const url = process.env.MESSAGING_WEBHOOK_URL;
  const secret = process.env.MESSAGING_WEBHOOK_SECRET;
  const channels = (process.env.MESSAGING_CHANNELS ?? "zalo_zns")
    .split(",")
    .map((c) => c.trim())
    .filter((c): c is OutboundChannel => c === "zalo_zns" || c === "sms");
  const events = new Set(
    (process.env.MESSAGING_EVENTS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
  return { enabled: Boolean(url && secret && secret.length >= 32 && channels.length), url, secret, channels, events };
}

export function signPayload(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Dùng ở phía nhận webhook (hoặc test) để xác thực tin do TH EDU gửi. */
export function verifyOutboundSignature(secret: string, timestamp: string, body: string, signature: string, toleranceSec = 300): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gửi 1 tin qua webhook (ký HMAC, timeout 5s, thử lại tối đa 3 lần khi lỗi mạng / 5xx / 429). */
export async function sendOutbound(message: OutboundMessage): Promise<OutboundResult> {
  const cfg = outboundConfig();
  if (!cfg.enabled || !cfg.url || !cfg.secret) return { ok: false, skipped: true, reason: "MESSAGING_WEBHOOK_URL / MESSAGING_WEBHOOK_SECRET chưa cấu hình" };

  const body = JSON.stringify({ version: 1, ...message, sentAt: new Date().toISOString() });
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "THEDU-Companion/1.0",
          "X-THEDU-Event": message.template,
          "X-THEDU-Idempotency-Key": message.idempotencyKey,
          "X-THEDU-Timestamp": timestamp,
          "X-THEDU-Signature": signPayload(cfg.secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) return { ok: true, status: res.status };
      lastError = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break; // lỗi phía yêu cầu → không thử lại
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(400 * 2 ** (attempt - 1));
  }
  console.error(`[messaging] Gửi "${message.template}" tới ${message.to.slice(0, 6)}*** thất bại:`, lastError);
  return { ok: false, skipped: false, error: lastError };
}

/** Sẵn sàng cho đăng nhập bằng OTP sau này: gửi mã qua SMS (fallback ZNS do bên nhận quyết định). */
export function sendOtp(phone: string, code: string, ttlMinutes = 5) {
  return sendOutbound({
    channels: ["sms", "zalo_zns"],
    to: phone,
    template: "otp",
    params: { code, ttl_minutes: String(ttlMinutes) },
    idempotencyKey: `otp:${phone}:${code}`,
  });
}
