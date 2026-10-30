"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleUserRound, KeyRound, LogOut, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { feedbackSoundEnabled, setFeedbackSound, toast } from "@/components/ui/toast";
import { logout } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length > 1 ? parts.at(-2)![0]! + parts.at(-1)![0]! : parts[0]![0]!).toUpperCase();
}

/**
 * Nút avatar góc phải header → Bottom Sheet tài khoản (tên, vai trò, cơ sở, đổi mật khẩu, đăng xuất).
 * Thay cho các nút rời rạc trên header — gọn trên điện thoại, bấm được bằng một tay.
 */
export function AccountSheet({
  name,
  subtitle,
  links,
  tone = "light",
}: {
  name: string;
  subtitle: string;
  links: { href: string; label: string; icon: "account" | "profile" }[];
  tone?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(feedbackSoundEnabled()), []);
  const ICONS: Record<string, LucideIcon> = { account: KeyRound, profile: CircleUserRound };

  async function signOut() {
    setOpen(false);
    if (!(await confirmSheet({ title: "Đăng xuất?", description: "Dữ liệu đã lưu trên máy này sẽ được xoá.", confirmLabel: "Đăng xuất", tone: "danger" }))) return;
    await logout();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Tài khoản: ${name}`}
        className={cn(
          "flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors sm:pr-3",
          tone === "dark" ? "hover:bg-white/10" : "hover:bg-accent",
        )}
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-sm font-bold ring-2",
            tone === "dark" ? "bg-edu-blue-500/25 text-edu-blue-100 ring-edu-blue-300/40" : "bg-primary/10 text-primary ring-primary/20",
          )}
        >
          {initialsOf(name)}
        </span>
        <span className="hidden max-w-[12rem] text-left leading-tight sm:block">
          <span className="block break-words text-sm font-semibold">{name}</span>
          <span className={cn("block break-words text-xs", tone === "dark" ? "text-white/60" : "text-muted-foreground")}>{subtitle}</span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="flex items-center gap-3 space-y-0">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-extrabold text-primary" aria-hidden>
              {initialsOf(name)}
            </span>
            <div className="min-w-0">
              <SheetTitle className="break-words">{name}</SheetTitle>
              <SheetDescription>{subtitle}</SheetDescription>
            </div>
          </SheetHeader>
          <ul className="divide-y overflow-hidden rounded-2xl ring-1 ring-border">
            {links.map((l) => {
              const Icon = ICONS[l.icon]!;
              return (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="tap flex min-h-14 items-center gap-3 px-3 font-semibold active:bg-muted">
                    <Icon className="size-5 text-muted-foreground" />
                    <span className="flex-1">{l.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Âm báo thành công / lỗi (toast) — giáo viên đứng lớp có thể tắt; lưu trên máy này */}
          <button
            type="button"
            role="switch"
            aria-checked={sound}
            onClick={() => {
              setFeedbackSound(!sound);
              setSound(!sound);
              if (!sound) toast.success("Đã bật âm báo");
            }}
            className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left font-semibold ring-1 ring-border active:bg-muted"
          >
            {sound ? <Volume2 className="size-5 text-muted-foreground" /> : <VolumeX className="size-5 text-muted-foreground" />}
            <span className="flex-1">
              Âm báo khi thao tác
              <span className="block text-xs font-normal text-muted-foreground">Tiếng “ting” khi lưu thành công, rung khi có lỗi</span>
            </span>
            <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", sound ? "bg-primary" : "bg-muted-foreground/30")} aria-hidden>
              <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]", sound ? "left-[1.375rem]" : "left-0.5")} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-rose-600 ring-1 ring-border active:bg-rose-50"
          >
            <LogOut className="size-5" /> Đăng xuất
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
