import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BrandFullLogo } from "@/components/shared/brand-logo";
import { PageWatermark } from "@/components/shared/page-watermark";
import { SiteFooter } from "@/components/shared/site-footer";
import { APP_NAME } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * Khung trang đăng nhập (phụ huynh / giáo viên): mobile có dải màu phía trên + form trượt lên,
 * desktop là thẻ giữa màn hình. Màu theo `band` để hai trang dễ phân biệt.
 */
export function LoginShell({
  icon: Icon,
  audience,
  title,
  description,
  band,
  backdrop,
  switchLink,
  children,
}: {
  icon: LucideIcon;
  /** "Phụ huynh" / "Giáo viên" */
  audience: string;
  title: string;
  description: string;
  /** class màu nền dải thương hiệu (mobile) và huy hiệu */
  band: string;
  /** class nền desktop */
  backdrop: string;
  switchLink: { href: string; question: string; label: string };
  children: React.ReactNode;
}) {
  const brand = (
    <>
      <p className="text-sm font-semibold opacity-90">{APP_NAME}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider">
        <Icon className="size-4" /> {audience}
      </p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm opacity-85">{description}</p>
    </>
  );

  return (
    <main className={cn("flex min-h-dvh flex-col bg-background md:items-center md:justify-center md:p-6", backdrop)}>
      {/* Mobile: dải màu phía trên, form trượt lên như bottom sheet */}
      <section className={cn("relative overflow-hidden px-6 pb-14 pt-[max(3rem,env(safe-area-inset-top))] text-white md:hidden", band)}>
        <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-20 -left-10 size-44 rounded-full bg-white/5" />
        <div className="relative">{brand}</div>
      </section>

      <div className="-mt-6 flex flex-1 flex-col md:mt-0 md:w-full md:max-w-md md:flex-none">
        {/* isolate: nền logo vẽ TRÊN nền trắng của form (không bị che) nhưng DƯỚI chữ và ô nhập */}
        <section className="isolate flex-1 overflow-hidden rounded-t-3xl bg-background md:flex-none md:rounded-2xl md:shadow-xl md:ring-1 md:ring-border">
          <PageWatermark />
          {/* Desktop: dải màu đầu thẻ */}
          <div className={cn("hidden px-8 pb-6 pt-7 text-white md:block", band)}>{brand}</div>
          <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 md:p-8 md:pt-6">
            {/* Logo nền trong suốt đặt trên nền sáng (trên dải màu sẽ bị chìm) */}
            <BrandFullLogo className="mx-auto mb-6 h-20" priority />
            {children}
            <div className="mt-8 space-y-1 text-center text-xs text-muted-foreground">
              <p>
                Tài khoản do quản trị viên trung tâm cấp. <b className="font-semibold text-foreground">Chưa có tài khoản?</b> Vui lòng liên hệ
                với trung tâm thông qua số điện thoại hoặc zalo
              </p>
              <p>Quên mật khẩu? Liên hệ quản trị viên trung tâm để được cấp lại.</p>
            </div>
          </div>
        </section>
        <p className="py-5 text-center text-sm text-muted-foreground">
          {switchLink.question}{" "}
          <Link href={switchLink.href} className="font-semibold text-foreground underline underline-offset-2">
            {switchLink.label}
          </Link>
        </p>
        <SiteFooter className="pb-[max(1.25rem,env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
