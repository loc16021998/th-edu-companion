import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/shared/brand-logo";
import { AccountSheet } from "@/components/shared/account-sheet";
import { ScrollHeader } from "@/components/shared/scroll-header";
import { APP_NAME, APP_SHORT_NAME } from "@/config/constants";
import { AdminFeedBell } from "@/features/admin-feed/components/admin-feed-bell";
import type { Tables } from "@/types/database.types";

/** Header tối của khu quản trị — phân biệt rõ với giao diện phụ huynh / giáo viên. */
export function AdminHeader({ profile, unread = 0 }: { profile: Tables<"profiles">; unread?: number }) {
  const brand = (
    <>
      <BrandMark className="h-8 w-12" priority />
      {/* Điện thoại: tên ngắn cho gọn; màn hình rộng: tên đầy đủ */}
      <span className="font-bold sm:hidden">{APP_SHORT_NAME}</span>
      <span className="hidden font-bold sm:inline">{APP_NAME}</span>
    </>
  );

  return (
    <ScrollHeader className="bg-edu-navy text-white">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          {/* Logo + tên → trang Tổng quan quản trị. Chỉ quản trị viên có liên kết này
              (header chỉ hiện sau requireRole("admin"); kiểm tra thêm vai trò để phòng hờ) */}
          {profile.role === "admin" ? (
            <Link
              href="/admin/dashboard"
              title="Về trang Tổng quan quản trị"
              aria-label={`${APP_NAME} — về trang Tổng quan quản trị`}
              className="-ml-1.5 flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edu-blue-300"
            >
              {brand}
            </Link>
          ) : (
            <span className="flex items-center gap-2.5">{brand}</span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-edu-blue-500/25 px-2 py-0.5 text-xs font-semibold text-edu-blue-100 ring-1 ring-edu-blue-300/30">
            <ShieldCheck className="size-3.5" /> Quản trị
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Hoạt động mới của phụ huynh & giáo viên (realtime) */}
          <AdminFeedBell adminId={profile.id} initialUnread={unread} />
          <AccountSheet
            tone="dark"
            name={profile.full_name || "Quản trị viên"}
            subtitle="Quản trị viên"
            links={[{ href: "/admin/account", label: "Đổi mật khẩu", icon: "account" }]}
          />
        </div>
      </div>
    </ScrollHeader>
  );
}
