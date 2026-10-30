"use client";

import { BrandLogo } from "@/components/shared/brand-logo";
import { ErrorFallback } from "@/components/shared/error-fallback";

// Bắt lỗi cho các route ngoài (dashboard), ví dụ /login khi submit form bằng action cũ.
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <BrandLogo className="text-lg" />
      <ErrorFallback {...props} />
    </main>
  );
}
