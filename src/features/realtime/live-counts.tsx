"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getBrowserClient, useIdleRealtime, whenIdle } from "@/lib/supabase/lazy-client";
import { CHAT_READ_EVENT, NOTIFICATIONS_READ_EVENT } from "@/lib/live-events";

export type LiveCounts = {
  /** Số cuộc trò chuyện có tin chưa đọc */
  chat: number;
  /** Giáo viên: số đơn xin nghỉ đang chờ xác nhận */
  leave: number;
  /** Thông báo chưa đọc theo loại (notification_type) — huy hiệu từng tab */
  unread: Record<string, number>;
};

const EMPTY: LiveCounts = { chat: 0, leave: 0, unread: {} };
const LiveCountsContext = createContext<LiveCounts>(EMPTY);

/** Số hiển thị trên menu (huy hiệu). Ngoài Provider → 0. */
export function useLiveCounts() {
  return useContext(LiveCountsContext);
}

/** Tổng thông báo chưa đọc của các loại cho trước. */
export function sumUnread(unread: Record<string, number>, types: readonly string[]) {
  return types.reduce((s, t) => s + (unread[t] ?? 0), 0);
}

function sameCounts(a: LiveCounts, b: LiveCounts) {
  if (a.chat !== b.chat || a.leave !== b.leave) return false;
  const ka = Object.keys(a.unread);
  return ka.length === Object.keys(b.unread).length && ka.every((k) => a.unread[k] === b.unread[k]);
}

/**
 * Một kết nối Supabase Realtime cho cả thanh tab đáy lẫn menu dọc: tin chat chưa đọc, thông báo chưa đọc theo loại
 * (+ đơn nghỉ chờ duyệt với giáo viên). Cập nhật khi có thay đổi (RLS chỉ gửi sự kiện của người dùng), khi app quay lại
 * foreground, mỗi lần chuyển trang và ngay khi người dùng vừa xem (sự kiện CHAT_READ / NOTIFICATIONS_READ).
 */
export function LiveCountsProvider({ userId, role, children }: { userId: string; role: "parent" | "teacher"; children: React.ReactNode }) {
  const [counts, setCounts] = useState<LiveCounts>(EMPTY);
  const pathname = usePathname();
  const instance = useId();

  const refresh = useCallback(async () => {
    const supabase = await getBrowserClient();
    const [convRes, leaveRes, notiRes] = await Promise.all([
      supabase
        .from("chat_conversations")
        .select("parent_id, last_message_at, last_sender_id, parent_last_read_at, teacher_last_read_at")
        .or(`parent_id.eq.${userId},teacher_id.eq.${userId}`),
      role === "teacher" ? supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending") : null,
      supabase.from("notifications").select("type").eq("recipient_id", userId).is("read_at", null).limit(500),
    ]);
    // Database chưa có bảng (chưa chạy migration) → giữ 0, không báo lỗi
    const chat = convRes.error
      ? 0
      : convRes.data.filter((c) => {
          if (!c.last_message_at || c.last_sender_id === userId) return false;
          const myRead = c.parent_id === userId ? c.parent_last_read_at : c.teacher_last_read_at;
          return !myRead || myRead < c.last_message_at;
        }).length;
    const leave = leaveRes && !leaveRes.error ? (leaveRes.count ?? 0) : 0;
    const unread: Record<string, number> = {};
    for (const n of notiRes.error ? [] : notiRes.data) unread[n.type] = (unread[n.type] ?? 0) + 1;
    const next = { chat, leave, unread };
    setCounts((prev) => (sameCounts(prev, next) ? prev : next));
  }, [userId, role]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 400);
  }, [refresh]);

  // Realtime nạp sau khi trang đã hiện (không chặn lần tải đầu)
  useIdleRealtime(`live-counts:${userId}:${role}:${instance}`, (supabase) => {
    let channel = supabase
      .channel(`live-counts:${userId}:${instance}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, schedule);
    if (role === "teacher") channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, schedule);
    return channel.subscribe();
  });

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [schedule]);

  // Đếm lần đầu khi trình duyệt rảnh; các lần chuyển trang sau → đếm lại ngay
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return whenIdle(() => void refresh());
    }
    void refresh();
  }, [pathname, refresh]);

  // Vừa xem tin nhắn / thông báo (đánh dấu đã đọc) → cập nhật huy hiệu ngay, không chờ realtime
  useEffect(() => {
    const onRead = () => void refresh();
    window.addEventListener(CHAT_READ_EVENT, onRead);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => {
      window.removeEventListener(CHAT_READ_EVENT, onRead);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, [refresh]);

  return <LiveCountsContext.Provider value={counts}>{children}</LiveCountsContext.Provider>;
}
