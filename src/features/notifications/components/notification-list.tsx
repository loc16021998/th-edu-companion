"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Award, BookCheck, CalendarClock, CalendarPlus, CalendarHeart, MapPinned, CalendarCheck, CalendarX2, CheckCheck, ClipboardCheck, Images, Loader2, Megaphone, MessageCircleHeart, MessageSquareReply, NotebookPen, Star, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

export type NotificationItem = {
  id: string;
  type: Enums<"notification_type">;
  title: string;
  body: string;
  read: boolean;
  href: string;
  time: string;
};

const TYPE_STYLE: Record<Enums<"notification_type">, { icon: LucideIcon; className: string; label: string }> = {
  daily_report: { icon: NotebookPen, className: "bg-orange-100 text-orange-600", label: "Sổ liên lạc" },
  attendance: { icon: ClipboardCheck, className: "bg-emerald-100 text-emerald-600", label: "Điểm danh" },
  feedback: { icon: MessageSquareReply, className: "bg-sky-100 text-sky-600", label: "Phản hồi" },
  monthly_summary: { icon: TrendingUp, className: "bg-violet-100 text-violet-600", label: "Tổng kết tháng" },
  homework_assigned: { icon: BookCheck, className: "bg-teal-100 text-teal-600", label: "Bài tập mới" },
  homework_graded: { icon: Star, className: "bg-amber-100 text-amber-600", label: "Cô đã chấm bài" },
  announcement: { icon: Megaphone, className: "bg-rose-100 text-rose-600", label: "Thông báo từ trung tâm" },
  fee_issued: { icon: Wallet, className: "bg-indigo-100 text-indigo-600", label: "Học phí" },
  fee_reminder: { icon: Wallet, className: "bg-amber-100 text-amber-700", label: "Nhắc học phí" },
  fee_paid: { icon: CheckCheck, className: "bg-emerald-100 text-emerald-700", label: "Đã nhận học phí" },
  moment_posted: { icon: Images, className: "bg-pink-100 text-pink-600", label: "Góc khoảnh khắc" },
  moment_comment: { icon: MessageCircleHeart, className: "bg-pink-100 text-pink-600", label: "Bình luận khoảnh khắc" },
  leave_request: { icon: CalendarX2, className: "bg-sky-100 text-sky-600", label: "Đơn xin nghỉ" },
  leave_decided: { icon: CalendarCheck, className: "bg-sky-100 text-sky-600", label: "Đơn xin nghỉ" },
  trial_assigned: { icon: CalendarHeart, className: "bg-emerald-100 text-emerald-700", label: "Lịch học thử" },
  campus_transfer: { icon: MapPinned, className: "bg-sky-100 text-sky-700", label: "Chuyển cơ sở" },
  achievement: { icon: Award, className: "bg-amber-100 text-amber-700", label: "Góc Thành tích" },
  booking_requested: { icon: CalendarPlus, className: "bg-indigo-100 text-indigo-700", label: "Lịch hẹn mới" },
  booking_decided: { icon: CalendarClock, className: "bg-indigo-100 text-indigo-700", label: "Lịch hẹn" },
  booking_reminder: { icon: AlarmClock, className: "bg-orange-100 text-orange-700", label: "Nhắc lịch hẹn" },
};

type OptimisticAction = { type: "read"; id: string } | { type: "read-all" };

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(items, (state, action: OptimisticAction) =>
    state.map((n) => (action.type === "read-all" || n.id === action.id ? { ...n, read: true } : n)),
  );
  const unread = optimistic.filter((n) => !n.read).length;
  // Tab "Mới": chỉ thông báo chưa xem — bấm vào xem là biến khỏi danh sách; tab "Đã xem": lịch sử
  const [tab, setTab] = useState<"new" | "read">(unread > 0 ? "new" : "read");
  const shown = optimistic.filter((n) => (tab === "new" ? !n.read : n.read));

  function open(item: NotificationItem) {
    // Điều hướng ngay (không chờ mạng); đánh dấu đã đọc chạy song song
    if (!item.read) {
      startTransition(async () => {
        applyOptimistic({ type: "read", id: item.id });
        const res = await markNotificationRead(item.id);
        if (!res.ok) console.warn("[notifications]", res.error);
      });
    }
    router.push(item.href);
  }

  function readAll() {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "read-all" });
      const res = await markAllNotificationsRead();
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Lọc thông báo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["new", "read"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {t === "new" ? `Mới${unread ? ` (${unread})` : ""}` : "Đã xem"}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <Button type="button" variant="ghost" size="sm" className="rounded-full text-primary" onClick={readAll} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            Đọc tất cả
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {shown.length === 0 && (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {tab === "new" ? "Bạn đã xem hết thông báo 🎉" : "Chưa có thông báo đã xem."}
        </p>
      )}
      <ul className={cn("divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border", shown.length === 0 && "hidden")}>
        {shown.map((n) => {
          const style = TYPE_STYLE[n.type];
          const Icon = style.icon;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted",
                  !n.read && "bg-accent/40",
                )}
              >
                <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl", style.className)}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm leading-snug", n.read ? "font-medium" : "font-bold")}>{n.title}</span>
                    {!n.read && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Chưa đọc" />}
                  </span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                  {/* Thông báo học phí kèm mã QR thanh toán đúng số tiền */}
                  {n.href.includes("pay=") && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      📱 Chạm để mở mã QR — đã điền sẵn số tiền
                    </span>
                  )}
                  <span className="mt-1.5 block text-xs font-medium text-muted-foreground/80">
                    {style.label} · {n.time}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
