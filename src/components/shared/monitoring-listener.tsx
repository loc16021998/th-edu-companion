"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/client";

/** Bắt lỗi JavaScript không được xử lý + Promise bị từ chối không ai bắt (ngoài các error boundary). Gắn 1 lần ở layout gốc. */
export function MonitoringListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, { context: { kind: "window.onerror" } });
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, { context: { kind: "unhandledrejection" } });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
