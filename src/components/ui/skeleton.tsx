import { cn } from "@/lib/utils";

/**
 * Khối giữ chỗ khi đang tải, có vệt sáng (shimmer) chạy ngang.
 * Vệt sáng là pseudo-element chạy bằng transform (GPU, không vẽ lại trang) → mượt cả trên điện thoại yếu;
 * máy bật "Giảm chuyển động" → không chạy (globals.css).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
