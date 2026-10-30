"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Hộp xác nhận dạng Bottom Sheet thay cho window.confirm (hộp xám của trình duyệt, khó bấm một tay):
 *   if (!(await confirmSheet({ title: "Xoá lớp K1A?", confirmLabel: "Xoá lớp", tone: "danger" }))) return;
 * <ConfirmSheetHost /> gắn 1 lần ở layout gốc.
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger": nút đỏ + biểu tượng cảnh báo (xoá, gỡ, thu hồi…) */
  tone?: "danger" | "default";
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let enqueue: ((req: Request) => void) | null = null;

export function confirmSheet(options: ConfirmOptions): Promise<boolean> {
  // Host chưa gắn (hiếm: trang lỗi / chưa hydrate) → dự phòng hộp của trình duyệt
  if (!enqueue) return Promise.resolve(window.confirm([options.title, options.description].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => enqueue!({ ...options, resolve }));
}

export function ConfirmSheetHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const [open, setOpen] = useState(false);
  const current = queue[0];
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    enqueue = (req) => {
      setQueue((q) => [...q, req]);
      setOpen(true);
    };
    return () => {
      enqueue = null;
    };
  }, []);

  function finish(ok: boolean) {
    if (!current) return;
    current.resolve(ok);
    setOpen(false);
    // Đợi hiệu ứng đóng xong rồi mới chuyển sang yêu cầu kế tiếp (nếu có)
    setTimeout(() => {
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest.length) setOpen(true);
        return rest;
      });
    }, 220);
  }

  const danger = current?.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <Sheet open={open && !!current} onOpenChange={(o) => !o && finish(false)}>
      <SheetContent
        hideClose
        // Thao tác nguy hiểm (xoá, gỡ…) → focus sẵn nút Huỷ: lỡ nhấn Enter cũng không xoá nhầm
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (current?.tone === "danger" ? cancelRef : confirmRef).current?.focus();
        }}
      >
        {current && (
          <>
            <SheetHeader className="flex items-start gap-3 space-y-0 pr-0">
              <span
                className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", danger ? "bg-rose-100 text-rose-600" : "bg-primary/10 text-primary")}
                aria-hidden
              >
                <Icon className="size-6" />
              </span>
              <div className="min-w-0 space-y-1 pt-0.5">
                <SheetTitle>{current.title}</SheetTitle>
                {current.description ? (
                  <SheetDescription>{current.description}</SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">Xác nhận thao tác</SheetDescription>
                )}
              </div>
            </SheetHeader>
            <SheetFooter>
              <Button ref={cancelRef} type="button" variant="outline" className="h-12 rounded-2xl text-base sm:h-10 sm:text-sm" onClick={() => finish(false)}>
                {current.cancelLabel ?? "Huỷ"}
              </Button>
              <Button
                ref={confirmRef}
                type="button"
                className={cn("h-12 rounded-2xl text-base sm:h-10 sm:text-sm", danger && "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400")}
                onClick={() => finish(true)}
              >
                {current.confirmLabel ?? "Đồng ý"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
