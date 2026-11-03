"use client";

import { ChatWidget } from "./chat-widget";

/** Trợ lý AI hỏi – đáp dạng trang (/parent/ai-assistant) — cùng cuộc trò chuyện với nút chat nổi. */
export function AssistantPage({ storageKey }: { storageKey: string }) {
  return <ChatWidget mode="parent" storageKey={storageKey} open variant="page" onClose={() => {}} />;
}
