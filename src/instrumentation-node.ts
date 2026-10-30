import type { Instrumentation } from "next";
import { captureError, monitoringEnabled } from "@/lib/monitoring/server";

/** Phần chạy trên Node.js của instrumentation (tách riêng để không lọt vào bundle Edge của middleware). */
export function registerNode() {
  if (!monitoringEnabled()) return;
  const original = console.error.bind(console);
  let inside = false;
  console.error = (...args: unknown[]) => {
    original(...args);
    // Chỉ log có nhãn "[module]" kèm đối tượng lỗi; chặn đệ quy nếu chính bộ ghi lỗi gọi console.error
    const [first, ...rest] = args;
    if (inside || typeof first !== "string" || !/^\[[\w-]+\]/.test(first)) return;
    const err = rest.find((a) => a instanceof Error || (a !== null && typeof a === "object" && "message" in (a as object)));
    if (!err) return;
    inside = true;
    void captureError({ error: err, source: "server", context: { log: first.slice(0, 120) } }).finally(() => {
      inside = false;
    });
  };
}

export const onRequestErrorNode: Instrumentation.onRequestError = async (error, request, context) => {
  const ua = (request.headers as Record<string, string | string[] | undefined>)["user-agent"];
  await captureError({
    error,
    source: "server",
    path: request.path,
    userAgent: (Array.isArray(ua) ? ua[0] : ua) ?? null,
    context: {
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: "renderSource" in context ? String(context.renderSource) : null,
      method: request.method,
    },
  });
};
