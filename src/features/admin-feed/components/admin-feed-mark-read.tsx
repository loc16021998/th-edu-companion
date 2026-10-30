"use client";

import { useEffect } from "react";
import { ADMIN_FEED_READ_EVENT } from "@/lib/live-events";
import { markAdminFeedReadFor } from "../actions";

/** Đặt ở trang xử lý của quản trị viên: mở trang → thông báo liên quan đã xem, chuông cập nhật ngay. */
export function AdminFeedMarkRead({
  groupKey,
  category,
  version = 0,
}: {
  groupKey?: string;
  category?: string;
  /** Đổi giá trị (vd. số tin nhắn) → đánh dấu lại — đang mở trang mà có hoạt động mới vẫn coi là đã xem */
  version?: number;
}) {
  useEffect(() => {
    void markAdminFeedReadFor({ groupKey, category }).then((res) => {
      if (res.ok && res.data.marked) window.dispatchEvent(new Event(ADMIN_FEED_READ_EVENT));
    });
  }, [groupKey, category, version]);
  return null;
}
