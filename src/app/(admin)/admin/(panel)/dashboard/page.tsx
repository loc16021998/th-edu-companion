import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Megaphone, School, UserCheck, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";
import { SessionBanner } from "@/components/shared/session-banner";
import { todayVN } from "@/lib/date";
import { isSchoolDay } from "@/lib/schedule";
import { getAuthContext } from "@/features/auth/queries";
import { CAMPUS_LIST, monthLabel } from "@/features/center/constants";
import { getCenterDashboard } from "@/features/center/queries";
import { AttendanceCard, FeeReportCard, LatePayersCard, ScaleTile } from "@/features/center/components/dashboard-widgets";

export const metadata: Metadata = { title: "Tổng quan vận hành" };

const SHORTCUTS: { href: string; label: string; description: string; icon: LucideIcon; tone: string }[] = [
  { href: "/admin/management?tab=fees", label: "Tạo học phí tháng", description: "1 cú click cho toàn bộ lớp, tự báo phụ huynh", icon: Wallet, tone: "from-violet-400 to-fuchsia-500" },
  { href: "/admin/announcements", label: "Đăng thông báo", description: "Lịch nghỉ lễ, cuộc thi, ngoại khoá", icon: Megaphone, tone: "from-rose-400 to-orange-400" },
  { href: "/admin/management?tab=teachers", label: "Giáo viên & phân lớp", description: "Tạo tài khoản, gán lớp, phân quyền cơ sở", icon: UserCog, tone: "from-sky-400 to-indigo-500" },
  { href: "/admin/management?tab=students", label: "Học sinh & phụ huynh", description: "Thêm học sinh, liên kết phụ huynh, chuyển lớp", icon: Users, tone: "from-emerald-400 to-teal-500" },
  { href: "/admin/attendance", label: "Điểm danh học sinh", description: "Điểm danh theo lớp, buổi tối nay", icon: ClipboardCheck, tone: "from-lime-400 to-emerald-500" },
  { href: "/admin/teacher-attendance", label: "Chấm công giáo viên", description: "Ghi nhận giáo viên đứng lớp", icon: UserCheck, tone: "from-slate-500 to-slate-700" },
];

export default async function AdminDashboardPage() {
  const today = todayVN();
  const [ctx, data] = await Promise.all([getAuthContext(), getCenterDashboard(today)]);
  const pick = (k: "students" | "teachers" | "classes") => Object.fromEntries(CAMPUS_LIST.map((c) => [c, data.scale[c][k]])) as Record<(typeof CAMPUS_LIST)[number], number>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Xin chào, {ctx?.profile.full_name || "quản trị viên"} 👋</h1>
        <p className="text-sm text-muted-foreground">Tổng quan vận hành CS1 Xa La & CS2 Ngô Thì Nhậm.</p>
      </div>

      <SessionBanner today={today} />

      <div className="grid gap-3 sm:grid-cols-3">
        <ScaleTile icon={Users} label="Học sinh" byCampus={pick("students")} tone="bg-emerald-100 text-emerald-700" />
        <ScaleTile
          icon={UserCheck}
          label="Giáo viên"
          byCampus={pick("teachers")}
          tone="bg-indigo-100 text-indigo-700"
          note={data.unassignedTeachers ? `${data.unassignedTeachers} giáo viên chưa được gán cơ sở` : undefined}
        />
        <ScaleTile icon={School} label="Lớp học" byCampus={pick("classes")} tone="bg-sky-100 text-sky-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttendanceCard data={data} schoolDay={isSchoolDay(today)} />
        <FeeReportCard data={data} monthTitle={monthLabel(data.month)} />
      </div>

      <LatePayersCard payers={data.latePayers} today={today} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Thao tác nhanh</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SHORTCUTS.map(({ href, label, description, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition-colors hover:bg-muted/50 active:scale-[0.99]"
            >
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${tone}`}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{label}</span>
                <span className="block break-words text-xs text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
