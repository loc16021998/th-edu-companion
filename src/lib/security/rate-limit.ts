import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Giới hạn tần suất (fixed window) dùng chung cho đăng nhập, API routes và các Server Action dễ bị spam.
 *
 * Kho đếm — tự chọn theo cấu hình, dùng chung giữa mọi instance serverless:
 *   1. Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) — nhanh nhất.
 *   2. Supabase: bảng `rate_limits` + hàm `rate_limit_hit()` (chỉ service_role gọi được) — không cần dịch vụ ngoài.
 *   3. Bộ nhớ tiến trình — dự phòng khi 1 & 2 chưa cấu hình / lỗi mạng (chỉ đếm trong 1 instance).
 * Kho lỗi → KHÔNG chặn người dùng thật (fail-open sang bộ nhớ), chỉ ghi log.
 */

export type RateLimitResult = { ok: boolean; remaining: number; retryAfter: number };

/** [số lượt tối đa, cửa sổ giây] */
export const RATE_LIMITS = {
  /** Mỗi IP: số lần đăng nhập SAI trong 15 phút (chống dò mật khẩu hàng loạt tài khoản) */
  loginIp: [30, 15 * 60],
  /** Mỗi tài khoản (SĐT/email): số lần đăng nhập SAI trong 15 phút (chống dò mật khẩu 1 tài khoản) */
  loginAccount: [5, 15 * 60],
  changePassword: [5, 15 * 60],
  /** Trợ lý ảo */
  parentChat: [20, 10 * 60],
  consultChat: [20, 10 * 60],
  /** Webhook ngân hàng / cron / push: số lần gửi SAI secret mỗi IP trong 15 phút */
  secretAuthFail: [10, 15 * 60],
  /** Thao tác ghi của người dùng (tin nhắn, bình luận, đơn, phản hồi…) */
  chatMessage: [40, 60],
  comment: [20, 60],
  submitForm: [10, 10 * 60],
  /** Báo lỗi tự động từ trình duyệt (mỗi IP) — chặn spam làm đầy bảng error_events */
  clientError: [30, 10 * 60],
} as const satisfies Record<string, readonly [number, number]>;
export type RateLimitName = keyof typeof RATE_LIMITS;

const TIMEOUT_MS = 1500;

/** Không lưu SĐT/email/IP thô trong kho đếm. */
function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("base64url").slice(0, 32);
}

// ---------------------------------------------------------------------------- 3. bộ nhớ
const memory = new Map<string, { count: number; resetAt: number }>();
function hitMemory(key: string, limit: number, windowSec: number, increment: boolean, now = Date.now()): RateLimitResult {
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    if (!increment) return toResult(0, limit, 0, increment);
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  if (increment) entry.count += 1;
  if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  return toResult(entry.count, limit, Math.ceil((entry.resetAt - now) / 1000), increment);
}

/**
 * Ghi 1 lượt (increment): được phép khi count ≤ limit.
 * Chỉ xem (peek): còn được phép khi count < limit — dùng trước khi kiểm tra mật khẩu / secret.
 */
function toResult(count: number, limit: number, ttlSec: number, increment: boolean): RateLimitResult {
  const ok = increment ? count <= limit : count < limit;
  return { ok, remaining: Math.max(0, limit - count), retryAfter: ok ? 0 : Math.max(1, ttlSec) };
}

// ---------------------------------------------------------------------------- 1. Upstash
function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function upstashPipeline(cmds: (string | number)[][]) {
  const cfg = upstash()!;
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  return (await res.json()) as { result?: unknown; error?: string }[];
}

async function hitUpstash(key: string, limit: number, windowSec: number, increment: boolean): Promise<RateLimitResult> {
  if (!increment) {
    const [get, ttl] = await upstashPipeline([
      ["GET", key],
      ["TTL", key],
    ]);
    if (get?.error) throw new Error(get.error);
    return toResult(Number(get?.result ?? 0), limit, Number(ttl?.result ?? 0), false);
  }
  const [incr, , ttl] = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, windowSec, "NX"],
    ["TTL", key],
  ]);
  if (incr?.error) throw new Error(incr.error);
  return toResult(Number(incr?.result), limit, Number(ttl?.result ?? windowSec), true);
}

// ---------------------------------------------------------------------------- 2. Supabase
// Migration chưa chạy → tạm dùng bộ nhớ, 5 phút sau thử lại DB (chạy migration xong không cần khởi động lại server)
let dbUnavailableUntil = 0;
const dbAvailable = () => Date.now() >= dbUnavailableUntil;

async function hitSupabase(key: string, limit: number, windowSec: number, increment: boolean): Promise<RateLimitResult> {
  const { data, error } = await createAdminClient()
    .rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSec, p_increment: increment })
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
    .single();
  if (error) {
    if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883") dbUnavailableUntil = Date.now() + 5 * 60_000;
    throw error;
  }
  return toResult(data.hit_count, limit, data.ttl_seconds, increment);
}

// ---------------------------------------------------------------------------- API
async function run(name: RateLimitName, subject: string, increment: boolean): Promise<RateLimitResult> {
  const [limit, windowSec] = RATE_LIMITS[name];
  const key = `rl:${name}:${hashKey(subject)}`;
  try {
    if (upstash()) return await hitUpstash(key, limit, windowSec, increment);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && dbAvailable()) return await hitSupabase(key, limit, windowSec, increment);
  } catch (err) {
    console.warn("[rate-limit] Kho đếm lỗi, tạm dùng bộ nhớ:", err instanceof Error ? err.message : err);
  }
  return hitMemory(key, limit, windowSec, increment);
}

/**
 * Ghi nhận 1 lượt cho `name:subject` và cho biết lượt này có được phép không.
 * `subject`: id người dùng / IP / SĐT… (được băm trước khi lưu).
 */
export function rateLimit(name: RateLimitName, subject: string): Promise<RateLimitResult> {
  return run(name, subject, true);
}

/** Chỉ kiểm tra (không ghi lượt): dùng khi chỉ đếm lần THẤT BẠI (đăng nhập sai, sai secret). */
export function rateLimitPeek(name: RateLimitName, subject: string): Promise<RateLimitResult> {
  return run(name, subject, false);
}

/** Xoá bộ đếm (vd. đăng nhập thành công → không tính các lần gõ sai trước đó của tài khoản). */
export async function resetRateLimit(name: RateLimitName, subject: string): Promise<void> {
  const key = `rl:${name}:${hashKey(subject)}`;
  memory.delete(key);
  try {
    if (upstash()) await upstashPipeline([["DEL", key]]);
    else if (process.env.SUPABASE_SERVICE_ROLE_KEY && dbAvailable()) {
      await createAdminClient().rpc("rate_limit_reset", { p_key: key }).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    }
  } catch {
    /* không quan trọng — bộ đếm tự hết hạn */
  }
}

/** IP người gọi. Ưu tiên header do nền tảng (Vercel / proxy) đặt; client không giả được x-real-ip trên Vercel. */
export function ipFromHeaders(h: Headers): string {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** IP trong Server Action. */
export async function currentIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

/** "Thử lại sau 3 phút" / "sau 40 giây". */
export function retryAfterText(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
}

/** Thông báo chuẩn khi bị chặn do thao tác quá nhanh. */
export function tooManyMessage(seconds: number): string {
  return `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterText(seconds)}.`;
}
