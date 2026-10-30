"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type NetworkInformation = EventTarget & { effectiveType?: string; saveData?: boolean };
type NavigatorWithConnection = Navigator & { connection?: NetworkInformation };

/**
 * Banner nổi báo mất mạng / mạng chậm (2G) / có mạng trở lại.
 * Nằm phía trên thanh tab đáy, không chặn thao tác.
 */
export function NetworkStatus() {
  const [state, setState] = useState<"online" | "offline" | "slow" | "restored">("online");

  useEffect(() => {
    const connection = (navigator as NavigatorWithConnection).connection;
    const isSlow = () => connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? "");
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;

    const update = () => setState(navigator.onLine ? (isSlow() ? "slow" : "online") : "offline");
    const onOffline = () => setState("offline");
    const onOnline = () => {
      setState("restored");
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(update, 2500);
    };

    update();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    connection?.addEventListener("change", update);
    return () => {
      clearTimeout(restoreTimer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener("change", update);
    };
  }, []);

  if (state === "online") return null;

  const content = {
    offline: { icon: WifiOff, text: "Mất kết nối mạng. Dữ liệu sẽ cập nhật khi có mạng trở lại.", tone: "bg-slate-900 text-white" },
    slow: { icon: Wifi, text: "Mạng đang chậm — ảnh và video có thể tải lâu hơn.", tone: "bg-amber-500 text-white" },
    restored: { icon: Wifi, text: "Đã kết nối lại.", tone: "bg-emerald-600 text-white" },
  }[state];
  const Icon = content.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 print:hidden bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
    >
      <p
        className={cn(
          "flex max-w-md items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2",
          content.tone,
        )}
      >
        <Icon className="size-4 shrink-0" />
        {content.text}
      </p>
    </div>
  );
}
