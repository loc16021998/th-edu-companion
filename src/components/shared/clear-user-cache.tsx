"use client";

import { useEffect } from "react";

/**
 * Đặt ở trang đăng nhập: xoá các trang / ảnh đã lưu để xem offline của người dùng trước
 * (đăng xuất bằng Server Action là chuyển trang "mềm" nên service worker không tự biết).
 */
export function ClearUserCache() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_USER_CACHE" });
    if ("caches" in window) void Promise.all([caches.delete("th-edu-pages"), caches.delete("th-edu-media")]).catch(() => undefined);
  }, []);
  return null;
}
