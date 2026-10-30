"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Award,
  Bell,
  BookCheck,
  BookOpenText,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CircleUserRound,
  GraduationCap,
  House,
  Images,
  KeyRound,
  MapPinned,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { BottomTabNav, NavBadge, isTabActive, type TabItem } from "@/components/shared/bottom-tab-nav";
import { sumUnread, useLiveCounts, type LiveCounts } from "@/features/realtime/live-counts";
import { cn } from "@/lib/utils";

/**
 * Phụ huynh — thanh tab đáy kiểu app (5 tab cốt lõi). Mỗi tab có huy hiệu = số thông báo CHƯA ĐỌC thuộc nhóm đó;
 * mở trang liên quan → thông báo được đánh dấu đã đọc → huy hiệu giảm ngay.
 */
export const PARENT_TAB_NOTIFICATIONS = {
  today: ["daily_report", "attendance", "announcement"],
  moments: ["moment_posted", "moment_comment"],
  learning: ["homework_assigned", "homework_graded", "monthly_summary", "achievement"],
  fees: ["fee_issued", "fee_reminder", "fee_paid"],
  me: ["leave_decided", "feedback", "campus_transfer", "booking_decided", "booking_reminder"],
} as const;

/** Nhóm "Học tập & Tiến độ": các trang chuyển qua lại bằng thanh mục con phía trên */
export const LEARNING_PAGES: readonly TabItem[] = [
  { href: "/parent/progress", label: "Tiến độ", icon: TrendingUp },
  { href: "/parent/achievements", label: "Thành tích", icon: Award },
  { href: "/parent/homework", label: "Bài tập", icon: BookCheck },
  { href: "/parent/attendance", label: "Chuyên cần", icon: CalendarCheck2 },
  { href: "/parent/schedule", label: "Lịch học", icon: CalendarClock },
];

function parentTabs(counts: LiveCounts): TabItem[] {
  const n = (types: readonly string[]) => sumUnread(counts.unread, types);
  return [
    { href: "/parent/dashboard", label: "Hôm nay", icon: House, badge: n(PARENT_TAB_NOTIFICATIONS.today), match: ["/parent/notifications", "/parent/announcements"] },
    { href: "/parent/moments", label: "Khoảnh khắc", icon: Images, badge: n(PARENT_TAB_NOTIFICATIONS.moments) },
    { href: "/parent/progress", label: "Học tập", icon: GraduationCap, badge: n(PARENT_TAB_NOTIFICATIONS.learning), match: LEARNING_PAGES.map((p) => p.href) },
    { href: "/parent/fees", label: "Học phí", icon: Wallet, badge: n(PARENT_TAB_NOTIFICATIONS.fees) },
    {
      href: "/parent/me",
      label: "Cá nhân",
      icon: CircleUserRound,
      badge: counts.chat + n(PARENT_TAB_NOTIFICATIONS.me),
      match: ["/parent/chat", "/parent/booking", "/parent/leave-request", "/parent/feedback", "/parent/account", "/parent/campuses"],
    },
  ];
}

/** Gắn huy hiệu tin chưa đọc vào mục "Nhắn tin". */
function withChatBadge(items: readonly TabItem[], chat: number): TabItem[] {
  return items.map((t) => (t.href === "/parent/chat" ? { ...t, badge: chat } : t));
}

/** Điện thoại: thanh tab đáy 5 mục (máy tính dùng menu dọc). */
export function ParentNav() {
  const counts = useLiveCounts();
  return <BottomTabNav tabs={parentTabs(counts)} preserve={["child"]} ariaLabel="Điều hướng phụ huynh" desktop="hidden" />;
}

/**
 * Thanh mục con (điện thoại) cho nhóm Học tập: Tiến độ · Thành tích · Bài tập · Chuyên cần · Lịch học — chạm 1 lần để chuyển,
 * không phải mở menu. Chỉ hiện khi đang ở 1 trang trong nhóm.
 */
export function ParentSectionTabs() {
  const pathname = usePathname();
  const child = useSearchParams().get("child");
  const { unread } = useLiveCounts();
  if (!LEARNING_PAGES.some((p) => isTabActive(pathname, p))) return null;
  const hrefOf = (href: string) => (child ? `${href}?${new URLSearchParams({ child })}` : href);
  const badgeOf = (href: string) =>
    href === "/parent/homework"
      ? sumUnread(unread, ["homework_assigned", "homework_graded"])
      : href === "/parent/progress"
        ? sumUnread(unread, ["monthly_summary"])
        : href === "/parent/achievements"
          ? sumUnread(unread, ["achievement"])
          : 0;
  return (
    // 5 ô chia đều, chỉ chữ (không biểu tượng) → vừa khít màn hình, không mục nào bị khuất ở mép phải
    <nav aria-label="Học tập & tiến độ" className="mb-4 md:hidden">
      <ul className="grid grid-cols-5 gap-1 rounded-2xl bg-muted p-1">
        {LEARNING_PAGES.map((p) => {
          const active = isTabActive(pathname, p);
          const badge = badgeOf(p.href);
          return (
            <li key={p.href}>
              <Link
                href={hrefOf(p.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-xs font-semibold leading-tight transition-all",
                  active ? "bg-card text-primary shadow-sm" : "text-muted-foreground active:bg-card/60",
                )}
              >
                {p.label}
                {badge > 0 && <span className="size-2 rounded-full bg-rose-500" aria-label={`${badge} mới`} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ----------------------------------------------------------------------------- Máy tính: menu dọc bên trái

const GROUPS: { title: string; items: TabItem[] }[] = [
  {
    title: "Theo dõi con",
    items: [
      { href: "/parent/dashboard", label: "Học tập hôm nay", icon: BookOpenText },
      { href: "/parent/schedule", label: "Lịch học", icon: CalendarClock },
      { href: "/parent/attendance", label: "Chuyên cần", icon: CalendarCheck2 },
      { href: "/parent/progress", label: "Tiến độ học tập", icon: TrendingUp },
      { href: "/parent/homework", label: "Bài tập về nhà", icon: BookCheck },
      { href: "/parent/achievements", label: "Góc Thành tích", icon: Award },
      { href: "/parent/moments", label: "Góc khoảnh khắc", icon: Images },
    ],
  },
  {
    title: "Liên lạc với cô",
    items: [
      { href: "/parent/chat", label: "Nhắn tin với cô", icon: MessageCircle },
      { href: "/parent/booking", label: "Đặt lịch hẹn với cô", icon: CalendarCheck },
      { href: "/parent/leave-request", label: "Xin nghỉ học", icon: CalendarX2 },
    ],
  },
  {
    title: "Trung tâm",
    items: [
      { href: "/parent/fees", label: "Học phí", icon: Wallet },
      { href: "/parent/campuses", label: "Cơ sở & đưa đón", icon: MapPinned },
      { href: "/parent/announcements", label: "Thông báo trung tâm", icon: Megaphone },
      { href: "/parent/feedback", label: "Góp ý & hỗ trợ", icon: MessageSquareText },
    ],
  },
  {
    title: "Tài khoản",
    items: [
      { href: "/parent/me", label: "Cá nhân", icon: CircleUserRound },
      { href: "/parent/notifications", label: "Bản tin của con", icon: Bell },
      { href: "/parent/account", label: "Đổi mật khẩu", icon: KeyRound },
    ],
  },
];

/** Máy tính / máy tính bảng: menu dọc chia nhóm giống khu quản trị; giữ bé đang chọn (?child=) khi chuyển trang. */
export function ParentSidebar() {
  const { chat } = useLiveCounts();
  const pathname = usePathname();
  const child = useSearchParams().get("child");
  const hrefOf = (href: string) => (child ? `${href}?${new URLSearchParams({ child })}` : href);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Menu phụ huynh" className="space-y-5 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
          {withChatBadge(group.items, chat).map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={hrefOf(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-[18px] shrink-0" />
                  <NavBadge count={badge} className="-right-2 -top-1.5" />
                </span>
                <span className="flex-1">{label}</span>
                {badge ? <span className="sr-only">({badge} tin chưa đọc)</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
