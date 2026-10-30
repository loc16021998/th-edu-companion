"use client";

import { useEffect } from "react";

/**
 * Đăng ký /sw.js (chỉ bản production) — trang offline dự phòng + cache tài nguyên tĩnh.
 * Chế độ dev: dọn service worker còn sót (từng chạy bản production / bật thông báo đẩy trên localhost) — nếu không,
 * trình duyệt có thể chạy JS / trang đã lưu cũ trong khi server đã là code mới → lỗi hydration.
 * Giữ lại service worker đang có đăng ký nhận thông báo đẩy (để thử Web Push khi dev), chỉ xoá bộ nhớ đệm của nó.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            regs.map(async (reg) => {
              const push = await reg.pushManager?.getSubscription().catch(() => null);
              if (push) await reg.update().catch(() => undefined);
              else await reg.unregister();
            }),
          );
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith("th-edu-")).map((k) => caches.delete(k)));
        } catch (err) {
          console.warn("[pwa] Không dọn được service worker (dev):", err);
        }
      })();
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err: unknown) => {
        console.warn("[pwa] Không đăng ký được service worker:", err);
      });
    };
    // Đợi trang tải xong để không tranh băng thông với lần tải đầu
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
