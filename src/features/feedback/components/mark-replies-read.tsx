"use client";

import { useEffect } from "react";
import { markFeedbackNotificationsRead } from "@/features/notifications/actions";

/** Mở tab Phản hồi → đánh dấu đã đọc thông báo "nhà trường trả lời" (chuông tự cập nhật qua realtime). */
export function MarkRepliesRead() {
  useEffect(() => {
    void markFeedbackNotificationsRead().then((res) => {
      if (!res.ok) console.warn("[feedback]", res.error);
    });
  }, []);
  return null;
}
