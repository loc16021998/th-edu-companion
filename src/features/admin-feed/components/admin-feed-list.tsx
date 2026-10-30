"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookCheck, School, CalendarCheck, CalendarX2, CheckCheck, ChevronRight, ClipboardCheck, Landmark, MessageCircle, MessageSquareText, NotebookPen, TrendingUp, type LucideIcon } from "lucide-react";
import { useIdleRealtime } from "@/lib/supabase/lazy-client";
import { ADMIN_FEED_READ_EVENT } from "@/lib/live-events";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/features/notifications/format";
import { Button } from "@/components/ui/button";
import { markAdminFeedItemRead, markAdminFeedSeen } from "../actions";
import { ADMIN_FEED_PATH, FEED_CATEGORIES, FEED_FILTERS, FEED_FILTER_LABEL, type FeedCategory, type FeedFilter } from "../constants";
import type { FeedItem } from "../queries";

const ICON: Record<FeedCategory, LucideIcon> = {
  feedback: MessageSquareText,
  leave: CalendarX2,
  chat: MessageCircle,
  homework: BookCheck,
  daily_report: NotebookPen,
  attendance: ClipboardCheck,
  summary: TrendingUp,
  payment: Landmark,
  admissions: School,
  consultation: CalendarCheck,
};

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dayLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" });

/**
 * Bảng tin hoạt động: lọc theo người gửi / loại. Tab "Chưa xem" chỉ hiện mục mới — bấm vào mục nào (để mở trang xử lý)
 * thì mục đó được đánh dấu đã xem và không còn hiện ở tab này; tab "Tất cả" giữ lịch sử.
 */
export function AdminFeedList({ items, filter }: { items: FeedItem[]; filter: FeedFilter }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = (n: FeedItem) => n.isNew && !allRead && !readIds.has(n.id);
  const newCount = items.filter(isNew).length;
  const [tab, setTab] = useState<"new" | "all">(newCount > 0 ? "new" : "all");
  const shown = tab === "new" ? items.filter(isNew) : items;

  function open(n: FeedItem) {
    if (isNew(n)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      void markAdminFeedItemRead(n.id).then(() => window.dispatchEvent(new Event(ADMIN_FEED_READ_EVENT)));
    }
    router.push(n.href);
  }

  function readAll() {
    setAllRead(true);
    startTransition(async () => {
      await markAdminFeedSeen();
      router.refresh();
    });
  }

  // Có hoạt động mới khi đang mở trang → tải lại danh sách
  useIdleRealtime("admin-feed-list", (supabase) =>
    supabase
      .channel("admin-feed-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 400);
      })
      .subscribe(),
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Chưa xem / tất cả" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["new", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {t === "new" ? `Chưa xem${newCount ? ` (${newCount})` : ""}` : "Tất cả"}
            </button>
          ))}
        </div>
        {newCount > 0 && (
          <Button type="button" variant="ghost" size="sm" className="rounded-full text-primary" onClick={readAll} disabled={pending}>
            <CheckCheck /> Đánh dấu đã xem tất cả
          </Button>
        )}
      </div>
      <nav aria-label="Lọc thông báo" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {FEED_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? ADMIN_FEED_PATH : `${ADMIN_FEED_PATH}?f=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
              f === filter ? "bg-slate-900 text-white ring-slate-900" : "bg-card text-muted-foreground ring-border hover:bg-muted",
            )}
          >
            {FEED_FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {tab === "new"
            ? "Bạn đã xem hết thông báo 🎉"
            : `Chưa có hoạt động nào${filter !== "all" ? " trong mục này" : ""}. Khi phụ huynh hoặc giáo viên thao tác, thông báo sẽ hiện ngay tại đây.`}
        </p>
      ) : (
        <ol className="space-y-1">
          {shown.map((n, i) => {
            const Icon = ICON[n.category];
            const fresh = isNew(n);
            const newDay = i === 0 || dayKey(shown[i - 1]!.updatedAt) !== dayKey(n.updatedAt);
            return (
              <li key={n.id}>
                {newDay && <p className="mb-1 mt-3 text-xs font-bold capitalize text-muted-foreground first:mt-0">{dayLabel.format(new Date(n.updatedAt))}</p>}
                <Link
                  href={n.href}
                  onClick={(e) => {
                    e.preventDefault();
                    open(n);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl p-3 ring-1 transition-colors hover:bg-muted/60",
                    fresh ? "bg-primary/5 ring-primary/20" : "bg-card ring-border",
                  )}
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", FEED_CATEGORIES[n.category].tone)}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-start gap-2">
                      <span className={cn("min-w-0 flex-1 text-sm", fresh ? "font-bold" : "font-semibold")}>{n.title}</span>
                      {n.count > 1 && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums" title={`${n.count} lượt trong 30 phút`}>
                          ×{n.count}
                        </span>
                      )}
                    </p>
                    {n.body && <p className="line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-bold",
                          n.actorRole === "teacher" ? "bg-emerald-50 text-emerald-700" : n.actorRole === "system" ? "bg-slate-100 text-slate-700" : "bg-sky-50 text-sky-700",
                        )}
                      >
                        {n.actorRole === "teacher" ? "GV" : n.actorRole === "system" ? "HT" : "PH"}
                      </span>
                      <span className="font-medium text-foreground/80">
                        {n.actorName || (n.actorRole === "teacher" ? "Giáo viên" : n.actorRole === "system" ? "Hệ thống" : "Phụ huynh")}
                      </span>
                      <span>· {relativeTime(n.updatedAt, now)}</span>
                      <span>· {FEED_CATEGORIES[n.category].label}</span>
                    </p>
                  </div>
                  {fresh && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Mới" />}
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
