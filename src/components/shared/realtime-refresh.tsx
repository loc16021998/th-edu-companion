"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { useIdleRealtime } from "@/lib/supabase/lazy-client";

/**
 * Lắng nghe thay đổi của 1 bảng qua Supabase Realtime (tôn trọng RLS) → tải lại dữ liệu trang (router.refresh).
 * `notice`: hiện thanh nhắc khi có bản ghi MỚI (INSERT), vd. "Có đơn xin nghỉ mới".
 */
export function RealtimeRefresh({ table, filter, channel, notice }: { table: string; filter?: string; channel: string; notice?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState(false);

  // Realtime nạp sau khi trang đã hiện (không chặn lần tải đầu)
  useIdleRealtime(`${channel}|${table}|${filter ?? ""}`, (supabase) =>
    supabase
      .channel(channel)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter && { filter }) }, (payload) => {
        if (notice && payload.eventType === "INSERT") setToast(true);
        // Gộp nhiều sự kiện liên tiếp thành 1 lần tải lại
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 300);
      })
      .subscribe(),
  );

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast || !notice) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <BellRing className="size-5 shrink-0 animate-bell-ring text-amber-300" />
      <span className="flex-1">{notice}</span>
      <button type="button" onClick={() => setToast(false)} aria-label="Đóng" className="rounded-full p-1 hover:bg-white/10">
        <X className="size-4" />
      </button>
    </div>
  );
}
