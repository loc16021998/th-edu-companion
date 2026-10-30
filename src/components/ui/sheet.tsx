"use client";

import { forwardRef, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom Sheet chuẩn app (Radix Dialog — khoá focus, Esc, khoá cuộn nền, ARIA sẵn):
 *  - Điện thoại: trượt từ dưới lên, thanh kéo + VUỐT XUỐNG ĐỂ ĐÓNG, chừa vùng an toàn (thanh cử chỉ Android / iPhone).
 *  - Máy tính (≥ sm): hộp thoại giữa màn hình.
 * Dùng thay mọi popup tự dựng / window.confirm để thao tác một tay.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const DRAG_CLOSE_PX = 90;

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Ẩn nút X góc phải (vd. sheet tự có nút đóng riêng) */
  hideClose?: boolean;
  /** Không cho đóng bằng vuốt / bấm nền (đang xử lý) */
  locked?: boolean;
  /**
   * Khung cố định (vd. Menu nhiều chức năng): không kéo khung bằng vuốt, không có thanh kéo; khung không tự cuộn —
   * người dùng đặt 1 vùng `min-h-0 flex-1 overflow-y-auto` bên trong để chỉ danh sách cuộn. Chiều cao do `className` quyết định.
   */
  fixed?: boolean;
};

export const SheetContent = forwardRef<HTMLDivElement, ContentProps>(function SheetContent(
  { className, children, hideClose, locked, fixed = false, onPointerDownOutside, onEscapeKeyDown, onOpenAutoFocus, ...props },
  ref,
) {
  const panel = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Vuốt xuống từ thanh kéo / tiêu đề để đóng (chỉ khi nội dung đang ở đầu → không xung đột với cuộn)
  const onPointerDown = (e: React.PointerEvent) => {
    if (fixed || locked || e.pointerType === "mouse" || (panel.current?.scrollTop ?? 0) > 0) return;
    if (!(e.target as HTMLElement).closest("[data-sheet-drag]")) return;
    drag.current = { startY: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
    panel.current.style.transition = "none";
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const close = drag.current.dy > DRAG_CLOSE_PX;
    drag.current = null;
    panel.current.style.transition = "";
    panel.current.style.transform = "";
    if (close) closeBtn.current?.click();
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={(node) => {
          panel.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDownOutside={(e) => {
          if (locked) e.preventDefault();
          onPointerDownOutside?.(e);
        }}
        onEscapeKeyDown={(e) => {
          if (locked) e.preventDefault();
          onEscapeKeyDown?.(e);
        }}
        // Mặc định: focus vào chính khung sheet (trình đọc màn hình đọc tiêu đề; không hiện viền focus lên nút đầu tiên
        // như hộp thoại máy tính). Cần focus 1 nút cụ thể → truyền onOpenAutoFocus.
        onOpenAutoFocus={(e) => {
          if (onOpenAutoFocus) return onOpenAutoFocus(e);
          e.preventDefault();
          panel.current?.focus({ preventScroll: true });
        }}
        className={cn(
          "fixed z-[80] flex max-h-[92dvh] flex-col bg-background shadow-2xl outline-none transition-transform duration-300",
          fixed ? "overflow-hidden" : "overflow-y-auto overscroll-contain",
          // Điện thoại: đáy màn hình
          "inset-x-0 bottom-0 rounded-t-[1.75rem] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200",
          // Máy tính: hộp thoại giữa màn hình — căn giữa bằng inset-0 + margin auto (không dùng transform → không xung đột hiệu ứng zoom)
          "sm:inset-0 sm:m-auto sm:h-fit sm:w-full sm:max-w-md sm:rounded-3xl sm:p-6",
          "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {/* Thanh kéo (điện thoại) — khung cố định thì chỉ chừa khoảng trống, không kéo được */}
        {fixed ? (
          <div className="h-3 shrink-0 sm:hidden" aria-hidden />
        ) : (
          <div data-sheet-drag className="-mx-4 flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-1 sm:hidden" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {children}
        <DialogPrimitive.Close
          ref={closeBtn}
          className={cn(
            "absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
            hideClose && "sr-only",
          )}
          disabled={locked}
          aria-label="Đóng"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sheet-drag className={cn("mb-3 space-y-1 pr-10 text-left", className)} {...props} />;
}

export const SheetTitle = forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(function SheetTitle(
  { className, ...props },
  ref,
) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-lg font-extrabold leading-snug", className)} {...props} />;
});

export const SheetDescription = forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  function SheetDescription({ className, ...props }, ref) {
    return <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
  },
);

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
