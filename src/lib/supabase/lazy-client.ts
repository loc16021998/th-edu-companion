"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Supabase phía trình duyệt (~68kB gzip) KHÔNG nằm trong lần tải trang đầu: chỉ nạp (dynamic import) khi thật sự cần
 * — lúc trình duyệt rảnh sau khi vẽ trang (realtime) hoặc khi người dùng thao tác (tải ảnh, tải file gốc).
 * Trên 4G yếu, trang hiện và bấm được sớm hơn; realtime vào sau vài trăm mili giây.
 */
type BrowserClient = SupabaseClient<Database>;

let clientPromise: Promise<BrowserClient> | null = null;

export function getBrowserClient(): Promise<BrowserClient> {
  clientPromise ??= import("./client").then((m) => m.createClient());
  return clientPromise;
}

/** Chạy `cb` khi trình duyệt rảnh (sau khi vẽ trang); Safari không có requestIdleCallback → setTimeout. Trả về hàm huỷ. */
export function whenIdle(cb: () => void, timeout = 2500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 300);
  return () => window.clearTimeout(id);
}

/** Ẩn app / tab lâu hơn mức này → gỡ kênh realtime (giải phóng kết nối WebSocket cho người khác). */
const HIDDEN_DISCONNECT_MS = 60_000;

/**
 * Đăng ký kênh realtime sau khi trang đã hiển thị. `subscribe` trả về kênh đã `.subscribe()`;
 * kênh được gỡ khi unmount hoặc khi `key` đổi (vd. đổi bé, đổi cuộc trò chuyện).
 *
 * Giờ cao điểm: Supabase giới hạn số kết nối Realtime đồng thời theo gói (Free 200, Pro 500). Điện thoại thu nhỏ app /
 * tab máy tính để mở cả ngày vẫn giữ kết nối → ẩn quá 60 giây thì gỡ kênh và đóng WebSocket (khi không còn kênh nào),
 * hiện lại thì đăng ký lại (subscribe tự mở lại WebSocket). Các component dùng hook đều tự tải lại dữ liệu khi trang hiện lại (visibilitychange) nên
 * không bỏ lỡ thay đổi trong lúc ngắt.
 */
export function useIdleRealtime(key: string, subscribe: (supabase: BrowserClient) => RealtimeChannel | null): void {
  // Luôn dùng hàm mới nhất mà không phải đăng ký lại kênh mỗi lần render
  const latest = useRef(subscribe);
  useEffect(() => {
    latest.current = subscribe;
  });

  useEffect(() => {
    let cancelled = false;
    let active: { supabase: BrowserClient; channel: RealtimeChannel } | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    // Kênh cũ gỡ xong hẳn mới đăng ký lại (cùng tên kênh → tránh nhận lại kênh đang đóng)
    let removing: Promise<unknown> = Promise.resolve();

    let connecting = false;

    const connect = () => {
      if (connecting || active) return;
      connecting = true;
      void Promise.all([getBrowserClient(), removing]).then(([supabase]) => {
        connecting = false;
        if (cancelled || active || document.visibilityState === "hidden") return;
        const channel = latest.current(supabase);
        if (channel) active = { supabase, channel };
      });
    };
    const disconnect = () => {
      if (!active) return;
      const { supabase, channel } = active;
      active = null;
      // Gỡ kênh không tự đóng WebSocket → không còn kênh nào (các hook khác cũng đã gỡ) thì ngắt hẳn kết nối
      removing = supabase
        .removeChannel(channel)
        .catch(() => undefined)
        .then(() => {
          if (supabase.getChannels().length === 0) return supabase.realtime.disconnect();
        });
    };
    const onVisibility = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      if (document.visibilityState === "hidden") hiddenTimer = setTimeout(disconnect, HIDDEN_DISCONNECT_MS);
      else connect();
    };

    const cancelIdle = whenIdle(connect);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      cancelIdle();
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      disconnect();
    };
  }, [key]);
}
