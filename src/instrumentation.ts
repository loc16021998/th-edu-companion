import type { Instrumentation } from "next";

/**
 * Giám sát lỗi phía server (Next.js instrumentation):
 *  - onRequestError: mọi lỗi render Server Component, Server Action, Route Handler → error_events (+ Sentry).
 *  - register(): bắt thêm các lỗi app tự xử lý rồi log `console.error("[module] …", err)` (lỗi truy vấn Supabase trong
 *    Server Action, gửi push, upload…) — các lỗi này không tới onRequestError vì đã được catch.
 * Chỉ bật ở bản production (dev dùng chung database thật). Ép bật: MONITORING_ENABLED=1; tắt: =0.
 * `process.env.NEXT_RUNTIME === "nodejs"` được thay lúc build → bundle Edge (middleware) không chứa phần Node.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    registerNode();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onRequestErrorNode } = await import("./instrumentation-node");
    await onRequestErrorNode(...args);
  }
};
