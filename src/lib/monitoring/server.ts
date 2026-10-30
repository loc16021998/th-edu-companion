import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { areaOf, categorize, cleanPath, fingerprintOf, isNoise, scrub, type ErrorArea, type ErrorCategory } from "./shared";

/**
 * Ghi nhận lỗi phía server:
 *  1. Bảng `error_events` (service role) → trang /admin/system.
 *  2. Sentry (nếu đặt SENTRY_DSN) qua Envelope API — không cần cài SDK.
 * Không bao giờ throw; lỗi lặp lại (cùng fingerprint) trong 60 giây chỉ ghi 1 lần / tiến trình.
 */
export type CaptureInput = {
  error: unknown;
  source?: "server" | "client" | "edge";
  level?: "error" | "warning" | "fatal";
  category?: ErrorCategory;
  area?: ErrorArea;
  path?: string | null;
  digest?: string | null;
  userId?: string | null;
  userRole?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown>;
};

/** Bản production mặc định bật; dev tắt (dùng chung database thật). MONITORING_ENABLED=1 / 0 để ép. */
export function monitoringEnabled() {
  return process.env.MONITORING_ENABLED ? process.env.MONITORING_ENABLED === "1" : process.env.NODE_ENV === "production";
}

const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_VERSION || "local";
const DEDUPE_MS = 60_000;
const recent = new Map<string, number>();

function describe(error: unknown): { name?: string; message: string; stack?: string; digest?: string; code?: string } {
  if (error instanceof Error) {
    const cause = error.cause as { code?: string; message?: string } | undefined;
    const code = (error as { code?: string }).code ?? cause?.code;
    // Lỗi Supabase thường bọc trong cause → ghép thông điệp gốc để biết bảng / mã lỗi
    const message = cause?.message && !error.message.includes(cause.message) ? `${error.message} — ${cause.message}` : error.message;
    return { name: error.name, message, stack: error.stack, digest: (error as { digest?: string }).digest, code };
  }
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    return { name: e.code ? `PostgrestError ${e.code}` : "Error", message: [e.message, e.details, e.hint].filter(Boolean).join(" · ") || JSON.stringify(error).slice(0, 500), code: e.code };
  }
  return { message: String(error) };
}

function dedupe(fingerprint: string): boolean {
  const now = Date.now();
  const last = recent.get(fingerprint);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(fingerprint, now);
  if (recent.size > 500) for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  return false;
}

/** Ghi lỗi; trả về fingerprint (hiển thị làm "mã lỗi" cho bộ phận hỗ trợ) hoặc null nếu bỏ qua. */
export async function captureError(input: CaptureInput): Promise<string | null> {
  if (!monitoringEnabled()) return null;
  try {
    const d = describe(input.error);
    if (isNoise(d.message, d.stack)) return null;
    const message = scrub(d.code && !d.message.includes(d.code) ? `[${d.code}] ${d.message}` : d.message, 1000) || "Lỗi không rõ";
    const stack = scrub(d.stack, 8000) || null;
    const category = categorize(d.name, message, input.category);
    const path = cleanPath(input.path);
    const fingerprint = fingerprintOf(category, message, stack);
    if (dedupe(`${input.source ?? "server"}:${fingerprint}`)) return fingerprint;

    const row = {
      source: input.source ?? "server",
      level: input.level ?? "error",
      category,
      area: input.area ?? areaOf(path),
      message,
      stack,
      digest: input.digest ?? d.digest ?? null,
      path,
      fingerprint,
      user_id: input.userId ?? null,
      user_role: input.userRole ?? null,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
      release: RELEASE,
      context: sanitizeContext(input.context),
    };

    await Promise.allSettled([saveToDatabase(row), sendToSentry(row)]);
    return fingerprint;
  } catch {
    return null; // Ghi nhận lỗi không được làm hỏng luồng chính
  }
}

function sanitizeContext(ctx: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(ctx ?? {}).slice(0, 20)) {
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k.slice(0, 40)] = v;
    else out[k.slice(0, 40)] = scrub(String(v), 300);
  }
  return out;
}

type Row = {
  source: string;
  level: string;
  category: string;
  area: string;
  message: string;
  stack: string | null;
  digest: string | null;
  path: string | null;
  fingerprint: string;
  user_id: string | null;
  user_role: string | null;
  user_agent: string | null;
  release: string;
  context: Record<string, string | number | boolean | null>;
};

async function saveToDatabase(row: Row) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { error } = await createAdminClient().from("error_events").insert(row);
  // Bảng chưa tạo (chưa chạy apply-monitoring.sql) → im lặng; lỗi khác in ra log máy chủ (không ghi đệ quy)
  if (error && !["PGRST205", "42P01"].includes(error.code)) process.stderr.write(`[monitoring] Không lưu được lỗi: ${error.message}\n`);
}

// ----------------------------------------------------------------------------- Sentry (tuỳ chọn)

/** DSN dạng https://<publicKey>@o123.ingest.sentry.io/<projectId> */
function parseDsn(dsn: string | undefined) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\//g, "");
    if (!u.username || !projectId) return null;
    return { key: u.username, url: `${u.protocol}//${u.host}/api/${projectId}/envelope/` };
  } catch {
    return null;
  }
}

async function sendToSentry(row: Row) {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: row.level,
    release: row.release,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    server_name: "th-edu-companion",
    fingerprint: [row.fingerprint],
    tags: { source: row.source, category: row.category, area: row.area, ...(row.digest && { digest: row.digest }) },
    user: row.user_id ? { id: row.user_id, segment: row.user_role ?? undefined } : undefined,
    request: row.path ? { url: row.path, headers: row.user_agent ? { "User-Agent": row.user_agent } : undefined } : undefined,
    exception: { values: [{ type: row.category, value: row.message, stacktrace: row.stack ? { frames: [] } : undefined }] },
    extra: { stack: row.stack, ...row.context },
  };
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
  await fetch(dsn.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=th-edu-monitoring/1.0, sentry_key=${dsn.key}`,
    },
    body,
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
}
