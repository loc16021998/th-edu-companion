"use client";

import { useEffect } from "react";
import { NOTIFICATIONS_READ_EVENT } from "@/lib/live-events";
import { markNotificationsReadFor } from "../actions";

/**
 * Đặt ở trang nội dung: mở trang (bấm thông báo, chạm thông báo đẩy, hay tự vào) → thông báo liên quan
 * (theo loại / bé / khoảng ngày) được đánh dấu đã xem → không còn hiện "mới", chuông giảm ngay.
 */
export function MarkNotificationsRead({
  types,
  studentId = null,
  from = null,
  to = null,
}: {
  types: string[];
  studentId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const key = `${types.join(",")}|${studentId}|${from}|${to}`;
  useEffect(() => {
    const [t, s, f, e] = key.split("|");
    void markNotificationsReadFor({
      types: t!.split(","),
      studentId: s === "null" ? null : s,
      from: f === "null" ? null : f,
      to: e === "null" ? null : e,
    }).then((res) => {
      if (!res.ok) return console.warn("[notifications]", res.error);
      // Huy hiệu trên thanh tab / chuông giảm ngay, không chờ realtime
      window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    });
    // Đóng luôn thông báo đẩy còn nằm trên thanh thông báo điện thoại cho đúng trang này
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then((reg) =>
        reg?.getNotifications().then((list) => {
          for (const n of list) {
            const url = (n.data as { url?: string } | null)?.url;
            if (url && new URL(url, location.origin).pathname === location.pathname) n.close();
          }
        }),
      );
    }
  }, [key]);
  return null;
}
