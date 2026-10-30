"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

/**
 * Lối vào trang đăng nhập quản trị từ trang đăng nhập phụ huynh / giáo viên (web + app trên điện thoại —
 * app cài ra màn hình chính không có thanh địa chỉ để gõ /admin/login).
 * Nút nhỏ, kín đáo → hỏi lại "khu vực dành riêng cho quản trị viên" trước khi chuyển, tránh phụ huynh bấm nhầm.
 * Quyền thật do máy chủ quyết định: tài khoản phụ huynh / giáo viên đăng nhập ở trang quản trị bị từ chối
 * (login → sai mục), và mọi trang /admin chặn người không phải quản trị (middleware + requireRole).
 */
export function AdminLoginEntry({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mx-auto flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <ShieldCheck className="size-4" aria-hidden /> Quản trị viên
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> Khu vực quản trị
            </SheetTitle>
            <SheetDescription>
              Trang đăng nhập này <b className="text-foreground">chỉ dành cho quản trị viên trung tâm</b>. Tài khoản phụ huynh hoặc giáo viên sẽ không đăng nhập
              được ở đây.
            </SheetDescription>
          </SheetHeader>
          <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
            Anh/chị là phụ huynh hoặc giáo viên? Hãy bấm <b className="text-foreground">Ở lại</b> và đăng nhập ở trang hiện tại.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Ở lại
            </Button>
            <Button asChild className="bg-slate-900 hover:bg-slate-900/90">
              <Link href={ADMIN_LOGIN_PATH} onClick={() => setOpen(false)}>
                Tôi là quản trị viên <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
