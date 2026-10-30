"use client";

import { categorize, fingerprintOf, isNoise, type ClientErrorReport, type ErrorCategory } from "./shared";

/**
 * Báo lỗi từ trình duyệt lên /api/monitoring/errors (→ error_events + Sentry).
 *  - Cùng 1 lỗi chỉ gửi 1 lần / phút; tối đa 20 báo cáo / lần mở trang (tránh bão báo lỗi khi vòng lặp hỏng).
 *  - Mất mạng → xếp hàng (tối đa 10), tự gửi khi có mạng trở lại; vẫn ghi nhận đó là lỗi mạng.
 *  - Chỉ chạy ở bản production (dev dùng chung database thật). Ép bật: NEXT_PUBLIC_MONITORING_ENABLED=1.
 */
const ENABLED =
  process.env.NEXT_PUBLIC_MONITORING_ENABLED === "1" || (process.env.NEXT_PUBLIC_MONITORING_ENABLED !== "0" && process.env.NODE_ENV === "production");
const MAX_PER_PAGE = 20;
const DEDUPE_MS = 60_000;

let sent = 0;
const lastSent = new Map<string, number>();
const queue: ClientErrorReport[] = [];
let listening = false;

function post(report: ClientErrorReport) {
  return fetch("/api/monitoring/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {
    if (queue.length < 10) queue.push(report);
  });
}

function flush() {
  while (queue.length) void post(queue.shift()!);
}

export type ReportOptions = {
  category?: ErrorCategory;
  level?: "error" | "warning";
  digest?: string;
  context?: ClientErrorReport["context"];
};

export function reportError(error: unknown, opts: ReportOptions = {}) {
  if (typeof window === "undefined") return;
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error)?.slice(0, 500) ?? "Lỗi không rõ");
  if (isNoise(e.message, e.stack)) return;
  if (!ENABLED) return;

  const category = categorize(e.name, e.message, opts.category);
  const fp = fingerprintOf(category, e.message, e.stack);
  const now = Date.now();
  if (sent >= MAX_PER_PAGE || now - (lastSent.get(fp) ?? 0) < DEDUPE_MS) return;
  lastSent.set(fp, now);
  sent += 1;

  const report: ClientErrorReport = {
    message: e.message.slice(0, 2000),
    name: e.name,
    stack: e.stack?.slice(0, 10_000),
    digest: opts.digest ?? (e as { digest?: string }).digest,
    category,
    level: opts.level,
    url: location.pathname,
    online: navigator.onLine,
    context: opts.context,
  };

  if (!listening) {
    listening = true;
    window.addEventListener("online", flush);
  }
  if (!navigator.onLine) {
    if (queue.length < 10) queue.push(report);
    return;
  }
  void post(report);
}
