"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { removePushSubscription, savePushSubscription, sendTestPush } from "../actions";

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/**
 * Bật / tắt thông báo đẩy trên thiết bị đang dùng (Web Push). iPhone: cần "Thêm vào Màn hình chính" trước (iOS 16.4+).
 * `compact`: dạng thẻ nhắc gọn (ẩn khi đã bật).
 */
export function PushOptIn({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator) || !VAPID_PUBLIC_KEY) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  function enable() {
    setMessage(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = (await getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
        const json = sub.toJSON();
        const res = await savePushSubscription({
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
          userAgent: navigator.userAgent.slice(0, 300),
        });
        if (!res.ok) {
          await sub.unsubscribe();
          return setMessage({ ok: false, text: res.error });
        }
        setState("on");
        setMessage({ ok: true, text: "Đã bật thông báo trên thiết bị này." });
      } catch (err) {
        console.warn("[push] Bật thông báo thất bại:", err);
        setMessage({ ok: false, text: "Không bật được thông báo trên trình duyệt này. Hãy thử Chrome / Safari mới nhất." });
      }
    });
  }

  function disable() {
    setMessage(null);
    startTransition(async () => {
      const sub = await (await getRegistration())?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const res = await sendTestPush();
      setMessage(res.ok ? { ok: true, text: `Đã gửi thử tới ${res.data.devices} thiết bị.` } : { ok: false, text: res.error });
    });
  }

  if (state === "checking" || (compact && (state === "on" || state === "unsupported" || state === "denied"))) return null;

  return (
    <div className={cn("space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", state === "on" ? "bg-emerald-100 text-emerald-600" : "bg-primary/10 text-primary")}>
          {state === "on" ? <BellRing className="size-5" /> : state === "ios-install" ? <Smartphone className="size-5" /> : <BellOff className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Thông báo trên điện thoại</p>
          <p className="text-sm text-muted-foreground">
            {state === "on" && "Đã bật — bạn sẽ nhận thông báo ngay cả khi không mở ứng dụng."}
            {state === "off" && "Nhận thông báo tức thì khi cô điểm danh, viết nhận xét, trả lời đơn nghỉ hoặc nhắn tin."}
            {state === "denied" && "Trình duyệt đang chặn thông báo. Mở cài đặt trang web (biểu tượng ổ khoá) → cho phép Thông báo."}
            {state === "unsupported" && "Trình duyệt này chưa hỗ trợ thông báo đẩy. Hãy dùng Chrome (Android) hoặc Safari (iPhone, iOS 16.4+)."}
            {state === "ios-install" && "Trên iPhone: bấm nút Chia sẻ → “Thêm vào Màn hình chính”, mở app từ màn hình chính rồi bật thông báo tại đây."}
          </p>
        </div>
      </div>
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap gap-2">
          {state === "off" ? (
            <Button type="button" className="h-10 rounded-xl" onClick={enable} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <BellRing />} Bật thông báo
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={test} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Gửi thử
              </Button>
              <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={disable} disabled={pending}>
                <BellOff /> Tắt trên thiết bị này
              </Button>
            </>
          )}
        </div>
      )}
      {message && <p className={cn("text-sm font-medium", message.ok ? "text-emerald-700" : "text-destructive")}>{message.text}</p>}
    </div>
  );
}
