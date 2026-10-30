"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const HIDE_AFTER_PX = 96;
const DELTA_PX = 6;

/**
 * Header dính đầu trang, phản ứng khi cuộn (kiểu app):
 *  - Đã cuộn → nền đặc hơn + bóng đổ.
 *  - Điện thoại: cuộn XUỐNG → trượt ẩn (thêm chỗ cho nội dung); cuộn LÊN → hiện lại ngay.
 * Chỉ dùng transform — không đổi chiều cao → nội dung không bị xô lệch (không gây layout shift).
 */
export function ScrollHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      setScrolled(y > 8);
      const delta = y - lastY;
      if (Math.abs(delta) < DELTA_PX) return;
      // Đang thao tác trong header (vd. mở menu) → không ẩn
      const focusInside = ref.current?.contains(document.activeElement) ?? false;
      setHidden(mobile.matches && !focusInside && delta > 0 && y > HIDE_AFTER_PX);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      ref={ref}
      data-scrolled={scrolled || undefined}
      className={cn(
        "sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-[transform,box-shadow,background-color] duration-300 ease-out will-change-transform print:hidden",
        hidden && "-translate-y-full",
        scrolled && "shadow-[0_2px_12px_rgba(0,0,0,0.08)]",
        className,
      )}
    >
      {children}
    </header>
  );
}
