import { Suspense } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { AccountSheet } from "@/components/shared/account-sheet";
import { ScrollHeader } from "@/components/shared/scroll-header";
import { ChildChip, type ChipChild } from "@/features/parent/components/child-chip";
import { APP_NAME, CAMPUS_LABELS, ROLE_LABELS } from "@/config/constants";
import { ROLE_HOME } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

/**
 * Header phụ huynh / giáo viên kiểu app: logo · (phụ huynh) avatar + lớp + cơ sở của bé đang xem, chạm để đổi bé ·
 * chuông thông báo · avatar tài khoản (Bottom Sheet: đổi mật khẩu, đăng xuất). Ẩn khi cuộn xuống trên điện thoại.
 */
export function AppHeader({ profile, actions, kids = [] }: { profile: Tables<"profiles">; actions?: React.ReactNode; kids?: ChipChild[] }) {
  const isParent = profile.role === "parent";
  const accountHref = isParent ? "/parent/account" : "/teacher/account";
  // Logo + tên → trang quản trị. Chỉ tài khoản quản trị vào được; phụ huynh / giáo viên sẽ gặp
  // trang đăng nhập quản trị (middleware chặn và báo "chỉ dành cho quản trị viên").
  const adminLabel = "Đến trang quản trị";
  const subtitle = `${ROLE_LABELS[profile.role]}${profile.campus ? ` · ${CAMPUS_LABELS[profile.campus]}` : ""}`;
  const showChip = isParent && kids.length > 0;

  return (
    <ScrollHeader className="border-b border-border/70 bg-white/70 backdrop-blur-xl backdrop-saturate-150 data-[scrolled]:bg-white/85">
      <div className="container flex h-14 items-center gap-2 sm:gap-3">
        {/* Có chip của bé → điện thoại ẩn logo để chip hiện đủ lớp + cơ sở (vd. "K1A · CS2 Ngô Thì Nhậm") */}
        <Link
          href={ROLE_HOME.admin}
          title={adminLabel}
          aria-label={`${APP_NAME} — ${adminLabel.toLowerCase()}`}
          className={cn(
            "-ml-1.5 shrink-0 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showChip && "hidden sm:block",
          )}
        >
          {/* Có chip của bé → điện thoại chỉ hiện biểu tượng cho gọn */}
          <BrandLogo nameClassName={cn("sr-only", showChip ? "lg:not-sr-only" : "sm:not-sr-only")} />
        </Link>
        <div className="flex min-w-0 flex-1 justify-start">
          {showChip && (
            <Suspense fallback={null}>
              <ChildChip />
            </Suspense>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {actions}
          <AccountSheet
            name={profile.full_name || "Người dùng"}
            subtitle={subtitle}
            links={[
              ...(isParent ? [{ href: "/parent/me", label: "Trang cá nhân", icon: "profile" as const }] : []),
              { href: accountHref, label: "Đổi mật khẩu", icon: "account" as const },
            ]}
          />
        </div>
      </div>
    </ScrollHeader>
  );
}
