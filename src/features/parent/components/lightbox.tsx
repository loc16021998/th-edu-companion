"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MediaImage } from "@/components/shared/media-image";
import type { MediaItem } from "@/features/daily-reports/media";

const SWIPE_X = 50;
const SWIPE_DOWN_CLOSE = 90;

/**
 * Xem ảnh/video toàn màn hình.
 * - Vuốt trái/phải: chuyển ảnh · Vuốt xuống: đóng · Phím ←/→/Esc trên máy tính.
 * - Video dùng playsInline để iOS Safari không tự bật trình phát toàn màn hình hệ thống.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const hasMany = items.length > 1;

  const go = useCallback(
    (delta: number) => onIndexChange((index + delta + items.length) % items.length),
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();

    // Khoá cuộn trang nền (cả html lẫn body để chắc chắn trên iOS Safari)
    const { documentElement: html, body } = document;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = body.style.overflow = "hidden";

    return () => {
      [html.style.overflow, body.style.overflow] = prev as [string, string];
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasMany) go(1);
      else if (e.key === "ArrowLeft" && hasMany) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, hasMany, onClose]);

  if (!item) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Xem ${item.type === "video" ? "video" : "ảnh"} ${index + 1} trên ${items.length}`}
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-black/95 text-white animate-in fade-in-0 duration-200"
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy) && hasMany) go(dx < 0 ? 1 : -1);
        else if (dy > SWIPE_DOWN_CLOSE && Math.abs(dy) > Math.abs(dx)) onClose();
      }}
    >
      <div className="flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="px-3 text-sm font-semibold tabular-nums text-white/80">
          {hasMany ? `${index + 1} / ${items.length}` : ""}
        </span>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex size-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="size-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {item.type === "video" ? (
          <video
            key={item.url}
            src={item.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg"
          />
        ) : (
          <div key={item.url} className="relative size-full">
            <MediaImage
              src={item.url}
              alt={`Ảnh hoạt động ${index + 1}`}
              fill
              sizes="100vw"
              priority
              className="select-none rounded-lg object-contain animate-in zoom-in-95 duration-200"
              draggable={false}
            />
          </div>
        )}

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Ảnh trước"
              className="absolute left-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex"
            >
              <ChevronLeft className="size-7" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Ảnh tiếp theo"
              className="absolute right-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex"
            >
              <ChevronRight className="size-7" />
            </button>
          </>
        )}
      </div>

      {hasMany && (
        <div className="flex justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-hidden>
          {items.map((m, i) => (
            <span
              key={m.url}
              className={i === index ? "h-1.5 w-5 rounded-full bg-white" : "size-1.5 rounded-full bg-white/40"}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
