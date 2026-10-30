"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { getBrowserClient, useIdleRealtime } from "@/lib/supabase/lazy-client";
import { NOTIFICATIONS_READ_EVENT } from "@/lib/live-events";
import { cn } from "@/lib/utils";

/**
 * Chuông thông báo + huy hiệu số chưa đọc.
 * Đồng bộ: Supabase Realtime (thông báo mới/đã đọc) + khi app quay lại foreground (PWA trên iOS
 * hay ngắt kết nối nền) + mỗi lần chuyển trang. Số khởi tạo do server render để không bị nhấp nháy.
 */
export function NotificationBell({ userId, initialUnread, href = "/parent/notifications" }: { userId: string; initialUnread: number; href?: string }) {
  const notificationsPath = href;
  const [unread, setUnread] = useState(initialUnread);
  const [pulse, setPulse] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const latest = useRef(initialUnread);

  const apply = useCallback((next: number) => {
    if (next > latest.current) setPulse(true); // có thông báo mới → chuông rung
    latest.current = next;
    setUnread(next);
  }, []);

  // Server render lại layout (revalidatePath) → nhận số mới
  useEffect(() => apply(initialUnread), [initialUnread, apply]);

  const refresh = useCallback(async () => {
    const supabase = await getBrowserClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) {
      console.warn("[notifications] Không đồng bộ được số chưa đọc:", error.message);
      return;
    }
    apply(count ?? 0);
  }, [userId, apply]);

  // Realtime nạp sau khi trang đã hiện (không chặn lần tải đầu)
  useIdleRealtime(`notifications:${userId}`, (supabase) =>
    supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => {
        void refresh();
        // Đang mở trang bản tin → tải lại danh sách để thấy thông báo mới
        if (pathnameRef.current === notificationsPath) router.refresh();
      })
      .subscribe(),
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onRead = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    // Vừa mở trang liên quan (đánh dấu đã đọc) → số trên chuông giảm ngay
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, [refresh]);

  // Chuyển trang → đồng bộ lại số chưa đọc. Lần đầu bỏ qua: số do server vừa render đã mới.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(t);
  }, [pulse]);

  const label = unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo";
  const active = pathname === notificationsPath;

  return (
    <Link
      href={notificationsPath}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent active:scale-95",
        active && "bg-accent text-primary",
      )}
    >
      <Bell className={cn("size-5", pulse && "origin-top animate-bell-ring")} strokeWidth={active ? 2.5 : 2} />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background tabular-nums"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
