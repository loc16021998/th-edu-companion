"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Activity,
  Bell,
  BellRing,
  BookCheck,
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  ChartLine,
  ChartNoAxesCombined,
  ChevronDown,
  Megaphone,
  ClipboardCheck,
  HandCoins,
  Images,
  KeyRound,
  Landmark,
  MapPinned,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MessageSquareText,
  NotebookPen,
  Palette,
  PenLine,
  School,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UsersRound,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BottomTabNav, type TabItem } from "@/components/shared/bottom-tab-nav";
import { cn } from "@/lib/utils";

type SubItem = { href: string; label: string; /** Nhãn ngắn trên thanh menu điện thoại */ mobileLabel: string };
type NavItem = { href: string; label: string; icon: LucideIcon; children?: SubItem[] };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Tổng quan",
    items: [
      { href: "/admin/dashboard", label: "Tổng quan vận hành", icon: LayoutDashboard },
      { href: "/admin/notifications", label: "Thông báo hoạt động", icon: Bell },
      { href: "/admin/analytics", label: "Phân tích vận hành", icon: ChartNoAxesCombined },
    ],
  },
  {
    title: "Điều hành",
    items: [
      { href: "/admin/management", label: "Quản lý tài khoản & phân lớp", icon: UsersRound },
      { href: "/admin/admissions", label: "Tuyển sinh & học thử", icon: UserPlus },
      { href: "/admin/announcements", label: "Truyền thông trung tâm", icon: Megaphone },
      { href: "/admin/chat", label: "Nhắn tin PH – GV", icon: MessageCircle },
      { href: "/admin/consultations", label: "Lịch hẹn trao đổi", icon: CalendarCheck },
    ],
  },
  {
    title: "Đào tạo",
    items: [
      { href: "/admin/classes", label: "Lớp học", icon: School },
      { href: "/admin/campuses", label: "Cơ sở & bản đồ", icon: MapPinned },
      { href: "/admin/shifts", label: "Ca học", icon: CalendarClock },
      { href: "/admin/students", label: "Học sinh", icon: Users },
      { href: "/admin/attendance", label: "Điểm danh học sinh", icon: ClipboardCheck },
      { href: "/admin/leave-requests", label: "Đơn xin nghỉ học", icon: CalendarX2 },
      { href: "/admin/daily-report", label: "Sổ liên lạc", icon: NotebookPen },
      { href: "/admin/homework", label: "Bài tập về nhà", icon: BookCheck },
      { href: "/admin/moments", label: "Góc khoảnh khắc", icon: Images },
      { href: "/admin/grading", label: "Chấm bài & thưởng sao", icon: PenLine },
      { href: "/admin/achievements", label: "Bảng vàng & huy hiệu", icon: Award },
      { href: "/admin/student-analytics", label: "Phân tích học sinh", icon: ChartLine },
    ],
  },
  {
    title: "Vận hành",
    items: [
      { href: "/admin/teacher-attendance", label: "Chấm công giáo viên", icon: UserCheck },
      { href: "/admin/payroll", label: "Lương giáo viên", icon: HandCoins },
      { href: "/admin/finance", label: "Quản lý tài chính", icon: Landmark },
      { href: "/admin/fees", label: "Học phí (ghi nhận)", icon: Wallet },
      { href: "/admin/feedback", label: "Lắng nghe phụ huynh", icon: MessageSquareText },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { href: "/admin/accounts", label: "Cấp tài khoản", icon: KeyRound },
      { href: "/admin/notifications-settings", label: "Cài đặt thông báo", icon: BellRing },
      { href: "/admin/system", label: "Giám sát hệ thống", icon: Activity },
      { href: "/admin/audit-logs", label: "Nhật ký & bảo mật", icon: ShieldCheck },
      { href: "/admin/design-system", label: "Design System", icon: Palette },
      {
        href: "/admin/account",
        label: "Đổi mật khẩu",
        icon: UserCog,
        children: [
          { href: "/admin/account", label: "Mật khẩu của tôi", mobileLabel: "Mật khẩu của tôi" },
          { href: "/admin/passwords/parent", label: "Đổi mật khẩu phụ huynh", mobileLabel: "Đổi MK phụ huynh" },
          { href: "/admin/passwords/teacher", label: "Đổi mật khẩu giáo viên", mobileLabel: "Đổi MK giáo viên" },
        ],
      },
    ],
  },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

const itemClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
    active ? "bg-slate-900 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

/** Mục có menu con: bấm để mở/đóng; tự mở khi đang ở một trang con. */
function NavGroupItem({ item, isActive }: { item: NavItem & { children: SubItem[] }; isActive: (href: string) => boolean }) {
  const childActive = item.children.some((c) => isActive(c.href));
  const [open, setOpen] = useState(childActive);
  const Icon = item.icon;
  const expanded = open || childActive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className={cn(itemClass(false), childActive && "text-foreground")}
      >
        <Icon className="size-[18px]" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <ul className="ml-[1.35rem] mt-1 space-y-0.5 border-l pl-3">
          {item.children.map((child) => {
            const active = isActive(child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    active ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Máy tính: menu dọc bên trái, chia nhóm; "Đổi mật khẩu" có menu con. */
export function AdminSidebar() {
  const isActive = useActive();
  return (
    <nav aria-label="Menu quản trị" className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
          {group.items.map((item) => {
            if (item.children) return <NavGroupItem key={item.label} item={{ ...item, children: item.children }} isActive={isActive} />;
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                <Icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Điện thoại: thanh menu cuộn ngang (mục con được trải phẳng thành từng nút). */
/** Điện thoại: 4 mục dùng nhiều nhất trên thanh tab đáy; mọi mục khác nằm trong "Menu" (Bottom Sheet chia nhóm). */
const MOBILE_TABS: TabItem[] = [
  { href: "/admin/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/notifications", label: "Hoạt động", icon: Bell },
  { href: "/admin/chat", label: "Tin nhắn", icon: MessageCircle },
  { href: "/admin/finance", label: "Tài chính", icon: Landmark },
];
const MOBILE_MENU: TabItem[] = GROUPS.flatMap((g) =>
  g.items
    .flatMap((item) => (item.children ? item.children.map((c) => ({ href: c.href, label: c.mobileLabel, icon: item.icon })) : [item]))
    .filter((item) => !MOBILE_TABS.some((t) => t.href === item.href))
    .map((item) => ({ href: item.href, label: item.label, icon: item.icon, group: g.title })),
);

/** Điện thoại: thanh tab đáy giống phụ huynh / giáo viên (máy tính dùng menu dọc). */
export function AdminMobileNav() {
  return (
    <Suspense fallback={null}>
      <BottomTabNav tabs={MOBILE_TABS} more={MOBILE_MENU} moreLabel="Menu" moreIcon={Menu} preserve={[]} ariaLabel="Menu quản trị" desktop="hidden" />
    </Suspense>
  );
}
