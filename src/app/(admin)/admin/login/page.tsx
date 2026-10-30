import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { BrandFullLogo } from "@/components/shared/brand-logo";
import { PageWatermark } from "@/components/shared/page-watermark";
import { SiteFooter } from "@/components/shared/site-footer";
import { APP_NAME } from "@/config/constants";
import { LoginForm } from "@/features/auth/components/login-form";
import { LOGIN_NOTICES } from "@/features/auth/errors";
import { ClearUserCache } from "@/components/shared/clear-user-cache";

export const metadata: Metadata = { title: "Đăng nhập quản trị" };

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

/** Trang đăng nhập riêng của quản trị viên — tách khỏi /login của phụ huynh & giáo viên. */
export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/admin") ? params.next : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const notice = errorKey ? LOGIN_NOTICES[errorKey] : undefined;

  return (
    <main className="isolate flex min-h-dvh items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_rgba(37,146,95,0.25),_transparent_60%)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {/* Nền logo TH EDU mờ — nền tối nên tăng độ đậm để vẫn thấy rõ */}
      <PageWatermark className="opacity-[0.2] md:opacity-[0.22]" />
      <ClearUserCache />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <BrandFullLogo className="h-24" priority />
          <p className="mt-4 text-sm font-medium text-white/60">{APP_NAME}</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="size-6 text-emerald-400" /> Quản trị hệ thống
          </h1>
        </div>

        <section className="rounded-2xl bg-background p-6 shadow-2xl ring-1 ring-white/10">
          <p className="mb-5 text-sm text-muted-foreground">
            Dành riêng cho quản trị viên: quản lý lớp học, học sinh, học phí và cấp tài khoản cho phụ huynh, giáo viên.
          </p>
          <LoginForm next={next} notice={notice} portals={["admin"]} />
        </section>

        <p className="mt-6 text-center text-xs text-white/50">
          Phụ huynh hoặc giáo viên?{" "}
          <a href="/login" className="font-semibold text-white/80 underline underline-offset-2">
            Đăng nhập tại đây
          </a>
        </p>
        <SiteFooter tone="dark" className="mt-6 px-0" />
      </div>
    </main>
  );
}
