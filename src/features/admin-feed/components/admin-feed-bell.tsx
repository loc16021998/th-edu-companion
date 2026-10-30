"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { getBrowserClient, useIdleRealtime } from "@/lib/supabase/lazy-client";
import { ADMIN_FEED_READ_EVENT } from "@/lib/live-events";
import { cn } from "@/lib/utils";
import { markAdminFeedItemRead } from "../actions";
import { ADMIN_FEED_PATH } from "../constants";

/**
 * Chuông thông báo của quản trị viên: số hoạt động mới của phụ huynh & giáo viên kể từ lần xem cuối.
 * Supabase Realtime → cập nhật ngay + hiện thông báo nhỏ góc màn hình (bấm để mở đúng trang xử lý).
 */
export function AdminFeedBell({ adminId, initialUnread }: { adminId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [pulse, setPulse] = useState(false);
  const [toast, setToast] = useState<{ id: string; title: string; body: string; href: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  const refresh = useCallback(async () => {
    const supabase = await getBrowserClient();
    // Đếm theo từng mục đã xem (RPC); DB chưa cập nhật → đếm theo mốc "đã xem tất cả"
    const rpc = await supabase.rpc("admin_feed_unread_count");
    if (!rpc.error) return setUnread(rpc.data ?? 0);
    const { data: state } = await supabase.from("admin_notification_state").select("last_seen_at").eq("admin_id", adminId).maybeSingle();
    const seen = state?.last_seen_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count, error } = await supabase.from("admin_notifications").select("id", { count: "exact", head: true }).gt("updated_at", seen);
    if (!error) setUnread(count ?? 0);
  }, [adminId]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Realtime nạp sau khi trang đã hiện (không chặn lần tải đầu)
  useIdleRealtime(`admin-feed:${adminId}`, (supabase) =>
    supabase
      .channel(`admin-feed:${adminId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, (payload) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void refresh(), 300);
        const row = payload.new as { id?: string; title?: string; body?: string; href?: string } | null;
        if (payload.eventType !== "DELETE" && row?.title) {
          setPulse(true);
          if (pathnameRef.current === ADMIN_FEED_PATH) router.refresh();
          else if (row.id) setToast({ id: row.id, title: row.title, body: row.body ?? "", href: row.href ?? ADMIN_FEED_PATH });
        }
      })
      .subscribe(),
  );

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Chuyển trang → đồng bộ lại. Lần đầu bỏ qua: số do server vừa render đã mới.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    void refresh();
  }, [pathname, refresh]);

  // Vừa xem thông báo ở trang xử lý → cập nhật số trên chuông ngay
  useEffect(() => {
    const onRead = () => void refresh();
    window.addEventListener(ADMIN_FEED_READ_EVENT, onRead);
    return () => window.removeEventListener(ADMIN_FEED_READ_EVENT, onRead);
  }, [refresh]);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const active = pathname === ADMIN_FEED_PATH;
  const label = unread > 0 ? `Thông báo, ${unread} mới` : "Thông báo";

  return (
    <>
      <Link
        href={ADMIN_FEED_PATH}
        aria-label={label}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn("relative inline-flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10", active && "bg-white/15")}
      >
        <Bell className={cn("size-5", pulse && "origin-top animate-bell-ring")} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-slate-950 tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>

      {toast && (
        <div role="status" className="fixed right-4 top-[calc(4rem+env(safe-area-inset-top))] z-50 w-[min(24rem,calc(100vw-2rem))] animate-in fade-in slide-in-from-top-2 rounded-2xl bg-card p-3 text-foreground shadow-xl ring-1 ring-border">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="size-4" />
            </span>
            <Link
              href={toast.href}
              onClick={() => {
                // Bấm xem → thông báo này không còn là mới
                void markAdminFeedItemRead(toast.id).then(() => refresh());
                setToast(null);
              }}
              className="min-w-0 flex-1"
            >
              <p className="break-words text-sm font-bold">{toast.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{toast.body}</p>
            </Link>
            <button type="button" onClick={() => setToast(null)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Đóng">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
