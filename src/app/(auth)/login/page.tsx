import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { BrandFullLogo } from "@/components/shared/brand-logo";
import { PageWatermark } from "@/components/shared/page-watermark";
import { SiteFooter } from "@/components/shared/site-footer";
import { APP_NAME } from "@/config/constants";
import { LoginChooser } from "@/features/auth/components/login-chooser";
import { LOGIN_NOTICES } from "@/features/auth/errors";
import { PARENT_LOGIN_PATH, TEACHER_LOGIN_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Đăng nhập" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Trang chọn: phụ huynh / giáo viên → mỗi bên một trang đăng nhập riêng. */
export default async function LoginChooserPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const as = typeof params.as === "string" ? params.as : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  // Giữ lại ?next= / ?error= khi chuyển sang trang đăng nhập riêng
  const forward = new URLSearchParams();
  if (next) forward.set("next", next);
  if (error) forward.set("error", error);
  const query = forward.toString();
  const withQuery = (path: string) => (query ? `${path}?${query}` : path);

  // Đã biết là ai (link cũ ?as=..., hoặc đang định vào khu nào) → vào thẳng trang đăng nhập đó
  if (as === "teacher" || as === "staff" || next === "/teacher" || next?.startsWith("/teacher/")) redirect(withQuery(TEACHER_LOGIN_PATH));
  if (as === "parent" || next === "/parent" || next?.startsWith("/parent/")) redirect(withQuery(PARENT_LOGIN_PATH));

  const notice = error ? LOGIN_NOTICES[error] : undefined;

  return (
    <main className="isolate flex min-h-dvh items-center justify-center bg-gradient-to-b from-accent/70 via-background to-background px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {/* Nền logo TH EDU mờ, giống các trang sau đăng nhập */}
      <PageWatermark />
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <BrandFullLogo className="h-28 md:h-32" priority />
          <h1 className="mt-3 text-xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sổ liên lạc thông minh — gắn kết trung tâm &amp; gia đình</p>
        </div>

        {notice && (
          <p role="status" className="flex gap-2 rounded-xl border bg-accent p-3 text-sm text-accent-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-center text-sm font-semibold">Bạn đăng nhập với tư cách:</p>
          <LoginChooser query={query} />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Tài khoản do quản trị viên trung tâm cấp. Chưa có tài khoản? Vui lòng liên hệ với trung tâm thông qua số điện thoại hoặc zalo
        </p>
        <SiteFooter className="px-0" />
      </div>
    </main>
  );
}
