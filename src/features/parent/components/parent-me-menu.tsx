"use client";

import Link from "next/link";
import { MapPinned, Bell, CalendarCheck, CalendarX2, ChevronRight, KeyRound, LogOut, Megaphone, MessageCircle, MessageSquareText, type LucideIcon } from "lucide-react";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { logout } from "@/features/auth/actions";
import { sumUnread, useLiveCounts } from "@/features/realtime/live-counts";
import { cn } from "@/lib/utils";

type Row = { href: string; label: string; hint: string; icon: LucideIcon; tone: string; badge?: number };

function MenuGroup({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="tap flex min-h-16 items-center gap-3 px-3 py-2.5 transition-colors active:bg-muted">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", r.tone)}>
                <r.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.label}</span>
                <span className="block break-words text-xs text-muted-foreground">{r.hint}</span>
              </span>
              {r.badge ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums" aria-label={`${r.badge} mới`}>
                  {r.badge > 99 ? "99+" : r.badge}
                </span>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Trang "Cá nhân": các mục không nằm trên thanh tab đáy — có huy hiệu chưa đọc realtime. */
export function ParentMeMenu({ childQuery }: { childQuery: string }) {
  const { chat, unread } = useLiveCounts();
  const q = childQuery ? `?${childQuery}` : "";

  async function signOut() {
    if (!(await confirmSheet({ title: "Đăng xuất khỏi TH EDU?", description: "Dữ liệu đã lưu trên máy này sẽ được xoá.", confirmLabel: "Đăng xuất", tone: "danger" }))) return;
    await logout();
  }

  return (
    <div className="space-y-5">
      <MenuGroup
        title="Liên lạc với cô"
        rows={[
          { href: `/parent/chat${q}`, label: "Nhắn tin với cô", hint: "Trao đổi trực tiếp với cô chủ nhiệm", icon: MessageCircle, tone: "bg-sky-100 text-sky-700", badge: chat },
          {
            href: `/parent/booking${q}`,
            label: "Đặt lịch hẹn với cô",
            hint: "Trao đổi riêng: trực tuyến, gọi điện, tại trung tâm",
            icon: CalendarCheck,
            tone: "bg-indigo-100 text-indigo-700",
            badge: sumUnread(unread, ["booking_decided", "booking_reminder"]),
          },
          {
            href: `/parent/leave-request${q}`,
            label: "Xin nghỉ học",
            hint: "Gửi đơn, xem cô đã duyệt chưa",
            icon: CalendarX2,
            tone: "bg-amber-100 text-amber-700",
            badge: sumUnread(unread, ["leave_decided"]),
          },
        ]}
      />
      <MenuGroup
        title="Trung tâm TH EDU"
        rows={[
          { href: `/parent/notifications${q}`, label: "Bản tin của con", hint: "Mọi thông báo về con", icon: Bell, tone: "bg-emerald-100 text-emerald-700" },
          {
            href: `/parent/campuses${q}`,
            label: "Cơ sở & đưa đón",
            hint: "Bản đồ, chỉ đường, hotline cơ sở",
            icon: MapPinned,
            tone: "bg-sky-100 text-sky-700",
            badge: sumUnread(unread, ["campus_transfer"]),
          },
          { href: `/parent/announcements${q}`, label: "Thông báo trung tâm", hint: "Lịch nghỉ lễ, cuộc thi, ngoại khoá", icon: Megaphone, tone: "bg-violet-100 text-violet-700" },
          {
            href: `/parent/feedback${q}`,
            label: "Góp ý & hỗ trợ",
            hint: "Gửi Ban Giám đốc — có thể ẩn danh",
            icon: MessageSquareText,
            tone: "bg-rose-100 text-rose-700",
            badge: sumUnread(unread, ["feedback"]),
          },
        ]}
      />
      <MenuGroup
        title="Tài khoản"
        rows={[{ href: `/parent/account${q}`, label: "Đổi mật khẩu", hint: "Bảo mật tài khoản", icon: KeyRound, tone: "bg-slate-100 text-slate-700" }]}
      />
      <button
        type="button"
        onClick={() => void signOut()}
        className="tap flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card font-semibold text-rose-600 shadow-sm ring-1 ring-border active:bg-rose-50"
      >
        <LogOut className="size-5" /> Đăng xuất
      </button>
    </div>
  );
}
