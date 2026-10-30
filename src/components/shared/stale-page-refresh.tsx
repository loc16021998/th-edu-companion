"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";

const timeFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * Service worker trả ngay bản trang đã lưu (mở app tức thì trên 4G yếu) và đánh dấu bằng <meta name="th-sw-stale">.
 * Component này thấy dấu đó → lấy dữ liệu mới nhất (router.refresh) và báo "Đang cập nhật…" cho tới khi xong;
 * mất mạng → báo đang xem bản lưu lúc mấy giờ, có mạng lại thì tự cập nhật.
 * Thông báo dạng nổi (fixed) → không đẩy bố cục trang.
 */
export function StalePageRefresh() {
  const router = useRouter();
  const [state, setState] = useState<{ at: number; offline: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  useEffect(() => {
    const meta = document.querySelector('meta[name="th-sw-stale"]');
    if (!meta) return;
    const at = Number(meta.getAttribute("content")) || 0;
    meta.remove();
    const refresh = () => {
      started.current = true;
      setState({ at, offline: false });
      startTransition(() => router.refresh());
    };
    if (navigator.onLine) {
      refresh();
      return;
    }
    setState({ at, offline: true });
    window.addEventListener("online", refresh, { once: true });
    return () => window.removeEventListener("online", refresh);
  }, [router]);

  // Dữ liệu mới đã về (pending: true → false) → ẩn thông báo.
  // Không dựa vào lần chạy đầu: effect này chạy cùng lượt mount với effect trên, lúc đó pending vẫn là false.
  const sawPending = useRef(false);
  useEffect(() => {
    if (pending) {
      sawPending.current = true;
      return;
    }
    if (started.current && sawPending.current) {
      started.current = false;
      sawPending.current = false;
      setState(null);
    }
  }, [pending]);

  if (!state) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-40 flex justify-center px-4 print:hidden"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
        {state.offline ? (
          <>
            <CloudOff className="size-3.5" /> Đang ngoại tuyến · xem bản lưu lúc {timeFormat.format(new Date(state.at))}
          </>
        ) : (
          <>
            <RefreshCw className="size-3.5 animate-spin" /> Đang cập nhật dữ liệu mới nhất…
          </>
        )}
      </span>
    </div>
  );
}
