import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ipFromHeaders, rateLimit, rateLimitPeek } from "./rate-limit";

/** So sánh hằng thời gian với từng secret hợp lệ (bỏ qua secret chưa cấu hình / quá ngắn). */
export function matchesSecret(token: string, secrets: (string | undefined)[]): boolean {
  return secrets.some((secret) => {
    if (!secret || secret.length < 16 || token.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  });
}

/**
 * Cổng cho route gọi bằng secret (webhook ngân hàng, cron, push dispatch).
 * Chỉ đếm lần gửi SAI secret theo IP → lệnh hợp lệ dồn dập (pg_net, ngân hàng) không bị chặn;
 * IP sai quá giới hạn bị khoá tạm (429) — kể cả khi sau đó đoán đúng, nên không dò được secret.
 * Trả về response từ chối, hoặc null nếu được đi tiếp.
 */
export async function guardSecret(request: Request, authorized: boolean): Promise<NextResponse | null> {
  const ip = ipFromHeaders(request.headers);
  const status = await rateLimitPeek("secretAuthFail", ip);
  if (!status.ok) {
    return NextResponse.json(
      { success: false, error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(status.retryAfter) } },
    );
  }
  if (authorized) return null;
  await rateLimit("secretAuthFail", ip);
  return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
}
