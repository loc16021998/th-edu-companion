import type { Metadata } from "next";
import Link from "next/link";
import { House } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
      <BrandLogo className="text-lg" />

      <div className="mt-10 flex flex-col items-center gap-5">
        <p
          aria-hidden
          className="bg-gradient-to-br from-primary to-emerald-300 bg-clip-text text-8xl font-extrabold leading-none tracking-tight text-transparent"
        >
          404
        </p>
        <div className="max-w-sm">
          <h1 className="text-xl font-bold">Không tìm thấy trang</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đường dẫn có thể đã thay đổi hoặc không còn tồn tại. Hãy quay lại trang chủ để tiếp tục theo dõi con nhé.
          </p>
        </div>
        <Button asChild className="h-11 w-full rounded-xl sm:w-auto">
          <Link href="/">
            <House /> Về trang chủ
          </Link>
        </Button>
      </div>
    </main>
  );
}
