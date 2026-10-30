import "server-only";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/config/constants";
import type { Database } from "@/types/database.types";

/**
 * Kiểm tra sức khoẻ hệ thống: Database (PostgREST), Supabase Auth, Storage (bucket ảnh/video).
 * Mỗi bước tối đa 4 giây; chạy song song. Dùng cho /api/health (giám sát 24/7) và trang /admin/system.
 */
export type CheckStatus = "ok" | "fail" | "skipped";
export type HealthCheck = { status: CheckStatus; latencyMs: number; error?: string };
export type HealthReport = {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  release: string;
  uptimeSec: number;
  checks: { database: HealthCheck; auth: HealthCheck; storage: HealthCheck; config: HealthCheck };
};

const TIMEOUT_MS = 4000;
const STARTED = Date.now();
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_VERSION || "local";

async function timed(fn: (signal: AbortSignal) => Promise<void>): Promise<HealthCheck> {
  const start = performance.now();
  try {
    await fn(AbortSignal.timeout(TIMEOUT_MS));
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? (err.name === "TimeoutError" ? `Quá ${TIMEOUT_MS / 1000}s không phản hồi` : err.message) : String(err);
    return { status: "fail", latencyMs: Math.round(performance.now() - start), error: message.slice(0, 200) };
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const config: HealthCheck =
    url && anon
      ? { status: service ? "ok" : "fail", latencyMs: 0, ...(!service && { error: "Thiếu SUPABASE_SERVICE_ROLE_KEY (tạo tài khoản, gửi push, ghi nhật ký lỗi)" }) }
      : { status: "fail", latencyMs: 0, error: "Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  if (!url || !anon) {
    const skipped: HealthCheck = { status: "skipped", latencyMs: 0 };
    return { status: "down", checkedAt: new Date().toISOString(), release: RELEASE, uptimeSec: Math.round((Date.now() - STARTED) / 1000), checks: { database: skipped, auth: skipped, storage: skipped, config } };
  }

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient<Database>(url, anon, opts);
  const admin = service ? createClient<Database>(url, service, opts) : null;

  const [database, auth, storage] = await Promise.all([
    timed(async (signal) => {
      const { error } = await db.rpc("health_ping").abortSignal(signal);
      if (!error) return;
      // Chưa chạy apply-monitoring.sql → thử đọc 1 bảng. Bị từ chối quyền (401/403) nghĩa là chính Postgres đã xử lý
      // truy vấn → database vẫn phản hồi; chỉ lỗi mạng / 5xx mới là sự cố.
      if (error.code === "PGRST202" || error.code === "42883") {
        const fallback = await db.from("classes").select("id", { head: true, count: "exact" }).limit(1).abortSignal(signal);
        if (fallback.error && ![401, 403].includes(fallback.status)) throw new Error(`Database HTTP ${fallback.status}: ${fallback.error.message}`);
        return;
      }
      throw new Error(`${error.code}: ${error.message}`);
    }),
    timed(async (signal) => {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon }, signal, cache: "no-store" });
      if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
    }),
    timed(async (signal) => {
      if (admin) {
        // Service role: kiểm tra đúng bucket ảnh/video tồn tại
        const res = await fetch(`${url}/storage/v1/bucket/${MEDIA_BUCKET}`, { headers: { apikey: service!, Authorization: `Bearer ${service}` }, signal, cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? `Không thấy bucket "${MEDIA_BUCKET}"` : `Storage HTTP ${res.status}`);
        return;
      }
      const { error } = await db.storage.from(MEDIA_BUCKET).list("", { limit: 1 });
      if (error) throw new Error(error.message);
    }),
  ]);

  const status: HealthReport["status"] = database.status !== "ok" ? "down" : auth.status === "ok" && storage.status === "ok" && config.status === "ok" ? "ok" : "degraded";
  return { status, checkedAt: new Date().toISOString(), release: RELEASE, uptimeSec: Math.round((Date.now() - STARTED) / 1000), checks: { database, auth, storage, config } };
}
