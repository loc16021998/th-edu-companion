import Image from "next/image";
import { APP_NAME } from "@/config/constants";
import { cn } from "@/lib/utils";

// Ảnh sinh từ logo gốc (assets/brand/th-edu-logo-source.jpg) bằng scripts/generate-pwa-icons.mjs
const MARK = { src: "/brand/th-edu-mark.png", width: 480, height: 285 };
const FULL = { src: "/brand/th-edu-logo.png", width: 720, height: 546 };

/**
 * Biểu tượng TH EDU (quyển sách + chữ H), nền trong suốt.
 * Kích thước khung theo `className` (mặc định size-9); ảnh tự co vừa khung.
 */
export function BrandMark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden
    >
      <Image src={MARK.src} alt="" width={MARK.width} height={MARK.height} sizes="96px" priority={priority} className="max-h-full w-auto object-contain" />
    </span>
  );
}

/** Logo đầy đủ (biểu tượng + chữ "TH EDU"), nền trong suốt — dùng ở trang đăng nhập. Chiều cao theo `className`. */
export function BrandFullLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={FULL.src}
      alt="TH EDU"
      width={FULL.width}
      height={FULL.height}
      priority={priority}
      // Hiển thị cao ~96–128px → chỉ tải bản ~256px thay vì 1920px
      sizes="(min-width: 640px) 256px, 192px"
      className={cn("h-24 w-auto", className)}
    />
  );
}

/** `nameClassName`: vd. "sr-only sm:not-sr-only" để chỉ hiện tên trên màn hình rộng. */
export function BrandLogo({ className, nameClassName }: { className?: string; nameClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
      <BrandMark className="h-9 w-14" priority />
      <span className={nameClassName}>{APP_NAME}</span>
    </span>
  );
}
