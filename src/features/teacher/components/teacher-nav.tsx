"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Award,
  Bell,
  BookCheck,
  CalendarClock,
  CalendarCheck,
  CalendarHeart,
  CalendarX2,
  ChartLine,
  ClipboardCheck,
  Images,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageCircle,
  NotebookPen,
} from "lucide-react";
import { BottomTabNav, NavBadge, isTabActive, type TabItem } from "@/components/shared/bottom-tab-nav";
import { sumUnread, useLiveCounts, type LiveCounts } from "@/features/realtime/live-counts";
import { cn } from "@/lib/utils";

/** Giữ lớp / ngày đang chọn khi chuyển giữa Điểm danh · Sổ liên lạc · Chấm bài… */
const PRESERVE = ["class", "date"] as const;

/** Menu giáo viên chia nhóm — dùng chung cho menu dọc (máy tính) và bảng "Menu" (điện thoại). */
const GROUPS: { title: string; items: TabItem[] }[] = [
  {
    title: "Giảng dạy",
    items: [
      { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/teacher/schedule", label: "Lịch dạy & chấm công", icon: CalendarClock },
      { href: "/teacher/attendance", label: "Điểm danh", icon: ClipboardCheck },
      { href: "/teacher/daily-report", label: "Sổ liên lạc", icon: NotebookPen },
    ],
  },
  {
    title: "Học sinh",
    items: [
      { href: "/teacher/achievements", label: "Tặng sao & huy hiệu", icon: Award },
      { href: "/teacher/grading", label: "Chấm bài & thưởng sao", icon: BookCheck },
      { href: "/teacher/student-analytics", label: "Phân tích học sinh", icon: ChartLine },
      { href: "/teacher/moments", label: "Góc khoảnh khắc", icon: Images },
      { href: "/teacher/trials", label: "Lớp học thử", icon: CalendarHeart },
    ],
  },
  {
    title: "Liên lạc",
    items: [
      { href: "/teacher/chat", label: "Nhắn tin phụ huynh", icon: MessageCircle },
      { href: "/teacher/availability", label: "Lịch hẹn phụ huynh", icon: CalendarCheck },
      { href: "/teacher/leave-requests", label: "Đơn xin nghỉ học", icon: CalendarX2 },
      { href: "/teacher/notifications", label: "Thông báo", icon: Bell },
    ],
  },
  {
    title: "Tài khoản",
    items: [{ href: "/teacher/account", label: "Đổi mật khẩu", icon: KeyRound }],
  },
];

/** Huy hiệu: tin chưa đọc, đơn xin nghỉ chờ xác nhận, bình luận khoảnh khắc, lịch học thử mới. */
function badgeOf(href: string, counts: LiveCounts): number {
  if (href === "/teacher/chat") return counts.chat;
  if (href === "/teacher/leave-requests") return counts.leave;
  if (href === "/teacher/moments") return sumUnread(counts.unread, ["moment_comment"]);
  if (href === "/teacher/trials") return sumUnread(counts.unread, ["trial_assigned"]);
  if (href === "/teacher/availability") return sumUnread(counts.unread, ["booking_requested", "booking_decided", "booking_reminder"]);
  return 0;
}

// ----------------------------------------------------------------------------- Điện thoại: thanh tab đáy

/** 4 mục dùng hằng ngày; mọi mục khác nằm trong "Menu" (Bottom Sheet chia nhóm) — giống khu quản trị. */
const MOBILE_TABS: TabItem[] = [
  { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/teacher/schedule", label: "Lịch dạy", icon: CalendarClock },
  { href: "/teacher/attendance", label: "Điểm danh", icon: ClipboardCheck },
  { href: "/teacher/daily-report", label: "Sổ liên lạc", icon: NotebookPen },
];

export function TeacherNav() {
  const counts = useLiveCounts();
  const more = GROUPS.flatMap((g) =>
    g.items
      .filter((item) => !MOBILE_TABS.some((t) => t.href === item.href))
      .map((item) => ({ ...item, group: g.title, badge: badgeOf(item.href, counts) })),
  );
  return (
    <BottomTabNav
      tabs={MOBILE_TABS}
      more={more}
      moreLabel="Menu"
      moreIcon={Menu}
      preserve={PRESERVE}
      ariaLabel="Điều hướng giáo viên"
      desktop="hidden"
    />
  );
}

// ----------------------------------------------------------------------------- Máy tính: menu dọc bên trái

/** Máy tính / máy tính bảng: menu dọc chia nhóm giống khu phụ huynh & quản trị; giữ ?class=&date= khi chuyển trang. */
export function TeacherSidebar() {
  const counts = useLiveCounts();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of PRESERVE) {
    const value = searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const hrefOf = (href: string) => (kept.size ? `${href}?${kept}` : href);

  return (
    <nav aria-label="Menu giáo viên" className="space-y-5 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isTabActive(pathname, { href });
            const badge = badgeOf(href, counts);
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
                {badge ? <span className="sr-only">({badge} mới)</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
