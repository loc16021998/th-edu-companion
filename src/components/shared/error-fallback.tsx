"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudAlert, House, Loader2, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isStaleDeploymentError, reloadForStaleDeployment } from "@/lib/stale-deployment";
import { reportError } from "@/lib/monitoring/client";

export type ErrorArea = "parent" | "teacher" | "admin" | "general";

/** Nút "về trang chính" + lời nhắn theo khu vực (lỗi trong trang con → menu của khu vẫn hiện, chỉ phần nội dung báo lỗi). */
const AREA: Record<ErrorArea, { home: string; homeLabel: string; who: string }> = {
  parent: { home: "/parent/dashboard", homeLabel: "Về trang Hôm nay", who: "Bố mẹ" },
  teacher: { home: "/teacher/dashboard", homeLabel: "Về trang Tổng quan", who: "Thầy cô" },
  admin: { home: "/admin/dashboard", homeLabel: "Về Tổng quan vận hành", who: "Bạn" },
  general: { home: "/", homeLabel: "Về trang chủ", who: "Bố mẹ / thầy cô" },
};

/** Nội dung dùng chung cho các error.tsx. Tự reload khi gặp lỗi do phiên bản ứng dụng cũ; mọi lỗi được báo về /admin/system. */
export function ErrorFallback({
  error,
  reset,
  area = "general",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  area?: ErrorArea;
}) {
  const stale = isStaleDeploymentError(error);
  const meta = AREA[area];
  const router = useRouter();
  const [reloading, setReloading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [copied, setCopied] = useState(false);

  // "Thử lại" phải tải lại dữ liệu từ server (lỗi thường do mạng chập chờn) — reset() đơn thuần chỉ vẽ lại phần đã lỗi
  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    // Ghi nhận cho lập trình viên: digest nối lỗi trình duyệt với log máy chủ cùng lượt render
    reportError(error, {
      category: stale ? "chunk" : navigator.onLine ? "render" : "network",
      level: stale ? "warning" : "error",
      digest: error.digest,
      context: { boundary: area },
    });
    if (stale) {
      setReloading(reloadForStaleDeployment());
      return;
    }
    console.error(error);
  }, [error, stale, area]);

  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  // Lỗi do mất mạng → tự thử lại khi có mạng trở lại
  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOnline = () => {
      setOffline(false);
      retryRef.current();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (reloading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        Ứng dụng vừa được cập nhật, đang tải lại...
      </div>
    );
  }

  const Icon = stale ? Sparkles : offline ? WifiOff : CloudAlert;
  const title = stale ? "Ứng dụng đã có phiên bản mới" : offline ? "Không có kết nối mạng" : "Ối, trang chưa tải được";
  const description = stale
    ? "TH EDU vừa được cập nhật. Tải lại trang để dùng phiên bản mới nhé."
    : offline
      ? "Điện thoại đang mất mạng. Trang sẽ tự tải lại ngay khi có mạng trở lại."
      : `Có thể do mạng chập chờn hoặc máy chủ đang bận. ${meta.who} bấm “Thử lại” giúp TH EDU nhé — lỗi đã được tự động báo cho kỹ thuật viên.`;

  return (
    <div className="mx-auto flex max-w-md animate-page-in flex-col items-center gap-5 px-4 py-16 text-center">
      <span
        className={cn(
          "relative flex size-24 items-center justify-center rounded-[2rem] ring-1",
          stale ? "bg-gradient-to-br from-emerald-50 to-sky-50 ring-emerald-100" : "bg-gradient-to-br from-amber-50 to-rose-50 ring-rose-100",
        )}
      >
        <Icon className={cn("size-11", stale ? "text-emerald-500" : offline ? "text-slate-500" : "text-rose-500", !stale && "animate-shake")} />
        {offline && <span className="absolute -right-1 -top-1 size-4 animate-ping rounded-full bg-amber-400/70" aria-hidden />}
      </span>
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button className="h-12 rounded-2xl text-base sm:h-11 sm:text-sm" disabled={retrying} onClick={() => (stale ? window.location.reload() : retry())}>
          {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {stale ? "Tải lại trang" : retrying ? "Đang thử lại..." : "Thử lại"}
        </Button>
        <Button asChild variant="outline" className="h-12 rounded-2xl text-base sm:h-11 sm:text-sm">
          <Link href={meta.home}>
            <House /> {meta.homeLabel}
          </Link>
        </Button>
      </div>
      {/* Mã lỗi chỉ dành cho bộ phận hỗ trợ — thu gọn, không làm người dùng bối rối */}
      {error.digest && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Thông tin cho bộ phận hỗ trợ</summary>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(error.digest!).then(() => setCopied(true));
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 font-mono"
          >
            {error.digest} · {copied ? "đã sao chép" : "chạm để sao chép"}
          </button>
        </details>
      )}
    </div>
  );
}
