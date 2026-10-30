"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  Glasses,
  Hand,
  MoreHorizontal,
  Share,
  SquarePlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { BrandMark } from "@/components/shared/brand-logo";
import { cn } from "@/lib/utils";
import { IN_APP_LABEL, type GuideKind, type PlatformInfo } from "@/lib/pwa/install";
import { usePWAInstall } from "@/lib/pwa/use-pwa-install";

/** Trang có ô nhập ở đáy màn hình (nhắn tin) → không che */
const HIDDEN_ON = ["/parent/chat", "/teacher/chat", "/chat"];

const COPY = {
  parent: "Cài đặt TH EDU Companion ra màn hình chính để nhận thông báo và xem nhật ký của con nhanh hơn!",
  teacher: "Cài đặt TH EDU Companion ra màn hình chính để mở điểm danh, sổ liên lạc nhanh hơn và nhận thông báo kịp thời!",
} as const;

// ----------------------------------------------------------------------------- Minh hoạ thao tác (giả lập giao diện trình duyệt)

/** Ngón tay chỉ vào nút cần bấm */
function Tap({ className }: { className?: string }) {
  return (
    <span className={cn("pointer-events-none absolute flex size-7 items-center justify-center motion-safe:animate-bounce", className)} aria-hidden>
      <Hand className="size-6 rotate-[-20deg] fill-amber-200 text-amber-700 drop-shadow" />
    </span>
  );
}

/** Nút đang được hướng dẫn bấm: viền nổi bật + nhịp sáng */
function Hot({ icon: Icon, label }: { icon: LucideIcon; label?: string }) {
  return (
    <span className="relative flex items-center gap-1 rounded-lg bg-sky-100 px-1.5 py-1 text-sky-700 ring-2 ring-sky-500 motion-safe:animate-pulse">
      <Icon className="size-5" />
      {label && <span className="text-xs font-bold">{label}</span>}
    </span>
  );
}

function SafariToolbar() {
  return (
    <div className="relative mx-auto flex w-full max-w-[17rem] items-center justify-between rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-500 ring-1 ring-slate-200" aria-hidden>
      <ChevronLeft className="size-5" />
      <ChevronRight className="size-5 opacity-40" />
      <span className="relative">
        <Hot icon={Share} />
        <Tap className="-bottom-6 left-3" />
      </span>
      <BookOpen className="size-5" />
      <Copy className="size-5" />
    </div>
  );
}

function AddressBar({ hot, hotLabel }: { hot: LucideIcon; hotLabel?: string }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[17rem] items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 ring-1 ring-slate-200" aria-hidden>
      <span className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs text-slate-500">app.thedu.edu.vn</span>
      <span className="relative">
        <Hot icon={hot} label={hotLabel} />
        <Tap className="-bottom-6 left-2" />
      </span>
    </div>
  );
}

function MenuSheet({ rows, hot }: { rows: { icon: LucideIcon; label: string }[]; hot: number }) {
  return (
    <ul className="mx-auto w-full max-w-[17rem] divide-y overflow-hidden rounded-2xl bg-slate-100 text-sm ring-1 ring-slate-200" aria-hidden>
      {rows.map((r, i) => (
        <li key={r.label} className={cn("relative flex items-center justify-between px-3 py-2", i === hot ? "bg-sky-100 font-bold text-sky-800 ring-2 ring-inset ring-sky-500" : "text-slate-600")}>
          {r.label}
          <r.icon className="size-4" />
          {i === hot && <Tap className="-right-1 top-5" />}
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="space-y-3 rounded-2xl bg-card p-3 ring-1 ring-border">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
        <span className="pt-0.5">{title}</span>
      </p>
      <div className="pb-4">{children}</div>
    </li>
  );
}

const ADD_HOME_ROWS = [
  { icon: Copy, label: "Sao chép" },
  { icon: Glasses, label: "Thêm vào danh sách đọc" },
  { icon: Bookmark, label: "Thêm dấu trang" },
  { icon: SquarePlus, label: "Thêm vào MH chính" },
];

/** Hướng dẫn cài tay theo thiết bị (iOS không có hộp thoại cài tự động; trình duyệt trong Zalo / Facebook không cài được). */
function Guide({ kind, platform }: { kind: GuideKind; platform: PlatformInfo }) {
  if (kind === "in-app") {
    const app = platform.inApp ? IN_APP_LABEL[platform.inApp] : "ứng dụng này";
    const browser = platform.os === "ios" ? "Safari" : "Chrome";
    return (
      <ol className="space-y-3">
        <Step n={1} title={<>Bạn đang mở trong {app}. Bấm nút <b>•••</b> ở góc trên</>}>
          <AddressBar hot={MoreHorizontal} />
        </Step>
        <Step n={2} title={<>Chọn <b>Mở bằng trình duyệt</b> ({browser})</>}>
          <MenuSheet rows={[{ icon: Copy, label: "Sao chép liên kết" }, { icon: ExternalLink, label: "Mở bằng trình duyệt" }]} hot={1} />
        </Step>
        <Step n={3} title={<>Trong {browser}, mở lại TH EDU — lời nhắc cài đặt sẽ hiện ra</>}>
          <p className="text-center text-xs text-muted-foreground">{app} không cho thêm ứng dụng ra màn hình chính.</p>
        </Step>
      </ol>
    );
  }
  if (kind === "android-manual") {
    return (
      <ol className="space-y-3">
        <Step n={1} title={<>Bấm nút <b>⋮</b> (hoặc <b>≡</b>) ở góc trình duyệt</>}>
          <AddressBar hot={EllipsisVertical} />
        </Step>
        <Step n={2} title={<>Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b></>}>
          <MenuSheet rows={[{ icon: Bookmark, label: "Dấu trang" }, { icon: Download, label: "Cài đặt ứng dụng" }, { icon: SquarePlus, label: "Thêm vào màn hình chính" }]} hot={1} />
        </Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-3">
      {kind === "ios-safari" ? (
        <Step n={1} title={<>Bấm nút <b>Chia sẻ</b> <Share className="inline size-4 -translate-y-0.5 text-sky-600" aria-hidden /> ở thanh dưới Safari</>}>
          <SafariToolbar />
          <p className="mt-6 text-center text-xs text-muted-foreground">iOS 26: bấm <b>•••</b> ở thanh dưới rồi chọn <b>Chia sẻ</b>.</p>
        </Step>
      ) : (
        <Step n={1} title={<>Bấm nút <b>Chia sẻ</b> <Share className="inline size-4 -translate-y-0.5 text-sky-600" aria-hidden /> trên thanh địa chỉ</>}>
          <AddressBar hot={Share} />
        </Step>
      )}
      <Step n={2} title={<>Kéo xuống, chọn <b>“Thêm vào MH chính”</b> rồi bấm <b>Thêm</b></>}>
        <MenuSheet rows={ADD_HOME_ROWS} hot={3} />
      </Step>
    </ol>
  );
}

// ----------------------------------------------------------------------------- Banner

/**
 * Nhắc "Cài TH EDU Companion ra màn hình chính" — banner nhỏ ở góc dưới (trên thanh tab):
 *   - Chrome / Edge Android: [Cài đặt ngay] mở thẳng hộp thoại cài đặt của trình duyệt (beforeinstallprompt).
 *   - Safari iPhone / iPad: [Cài đặt ngay] mở hướng dẫn 2 bước có hình minh hoạ (Chia sẻ → Thêm vào MH chính).
 *   - Trình duyệt trong Zalo / Facebook: hướng dẫn mở bằng Safari / Chrome trước.
 * Tinh tế: chỉ trên điện thoại chưa cài, từ lần mở thứ 2, sau ~8 giây; [Bỏ qua] → im 7 → 21 ngày → thôi hẳn;
 * cài xong (hoặc mở từ màn hình chính) → tự ẩn vĩnh viễn.
 */
export function InstallPrompt({ role = "parent" }: { role?: "parent" | "teacher" }) {
  const pwa = usePWAInstall();
  const pathname = usePathname();
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wasInstalled = useRef(pwa.isInstalled);

  // Cài xong trong lúc đang mở app (Android: sự kiện appinstalled) → chúc mừng 1 lần, banner tự ẩn
  useEffect(() => {
    if (pwa.ready && pwa.isInstalled && !wasInstalled.current && !pwa.isStandalone) {
      toast.success("Đã cài TH EDU Companion 🎉", "Mở từ biểu tượng trên màn hình chính để dùng nhanh hơn.");
      setGuideOpen(false);
    }
    wasInstalled.current = pwa.isInstalled;
  }, [pwa.ready, pwa.isInstalled, pwa.isStandalone]);

  const hiddenHere = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const showBanner = pwa.shouldShow && !hiddenHere && !guideOpen;

  async function install() {
    if (pwa.canPromptNative) {
      setBusy(true);
      const outcome = await pwa.promptInstall().finally(() => setBusy(false));
      if (outcome === "dismissed") pwa.dismiss();
      if (outcome !== "unavailable") return;
    }
    setGuideOpen(true);
  }

  function doneManually() {
    pwa.markInstalled();
    setGuideOpen(false);
    toast.success("Tuyệt vời! 🎉", "Từ nay mở TH EDU từ biểu tượng trên màn hình chính nhé.");
  }

  return (
    <>
      {showBanner && (
        <div
          role="dialog"
          aria-label="Cài đặt ứng dụng ra màn hình chính"
          className="fixed inset-x-3 bottom-[calc(var(--bottom-nav,4.5rem)+env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 rounded-2xl bg-card p-3 shadow-xl ring-1 ring-border duration-300 md:bottom-4 print:hidden"
        >
          <div className="flex items-start gap-3">
            <BrandMark className="h-10 w-14 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{COPY[role]}</p>
            <button type="button" onClick={pwa.dismiss} className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Đóng lời nhắc">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={pwa.dismiss}>
              Bỏ qua
            </Button>
            <Button type="button" className="h-10 rounded-xl" onClick={() => void install()} disabled={busy}>
              <Download /> Cài đặt ngay
            </Button>
          </div>
        </div>
      )}

      <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
        <SheetContent>
          {pwa.platform && (
            <>
              <SheetHeader>
                <SheetTitle>Thêm TH EDU ra màn hình chính</SheetTitle>
                <SheetDescription>
                  Chỉ mất 10 giây — mở app bằng 1 chạm như ứng dụng thật
                  {pwa.platform.os === "ios" ? " và nhận được thông báo của trung tâm (iPhone chỉ gửi thông báo cho app đã thêm ra màn hình chính)." : "."}
                </SheetDescription>
              </SheetHeader>
              <Guide kind={pwa.guide ?? "android-manual"} platform={pwa.platform} />
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    pwa.dismiss();
                    setGuideOpen(false);
                  }}
                >
                  Để sau
                </Button>
                {pwa.guide !== "in-app" && (
                  <Button type="button" onClick={doneManually}>
                    Tôi đã thêm xong
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
