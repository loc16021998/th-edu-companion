"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircleMore } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMode } from "./chat-widget";

// Khung chat chỉ tải khi người dùng bấm mở lần đầu → trang đăng nhập / trang chính nhẹ hơn (~50KB JS)
const ChatWidget = dynamic(() => import("./chat-widget").then((m) => m.ChatWidget), { ssr: false });
import { ZaloIcon, ZALO_URL } from "./zalo";

/**
 * 2 nút nổi góc dưới bên phải:
 *  - "Chat với tư vấn viên": khung chat trả lời tự động (ưu tiên), có lối gặp người thật.
 *  - "Chat Zalo": mở Zalo của trung tâm (chưa đăng nhập Zalo → trang đăng nhập Zalo).
 * `aboveTabBar`: trang có thanh tab cố định ở đáy (khu phụ huynh / giáo viên) → đẩy nút lên trên thanh tab.
 * `raised`: trang có thanh "Lưu" dính đáy (điểm danh, sổ liên lạc của giáo viên) → đẩy nút cao hơn để không che nút Lưu.
 */
export function FloatingContact({
  mode,
  storageKey,
  aboveTabBar = false,
  raised = false,
}: {
  mode: ChatMode;
  storageKey: string;
  aboveTabBar?: boolean;
  raised?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {!open && (
        <div
          className={cn(
            "fixed right-4 z-40 flex flex-col items-end gap-3 md:right-6 print:hidden",
            raised
              ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-24"
              : aboveTabBar
                ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6"
                : "bottom-[max(1rem,env(safe-area-inset-bottom))] md:bottom-6",
          )}
        >
          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat Zalo với trung tâm"
            title="Chat Zalo với trung tâm"
            className="group flex items-center gap-2 rounded-full bg-[#0068FF] p-1.5 text-white shadow-lg shadow-[#0068FF]/30 transition-transform active:scale-95 md:pr-4"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <ZaloIcon className="size-8 text-white" textColor="#0068FF" />
            </span>
            <span className="hidden text-sm font-semibold md:inline">Chat Zalo</span>
          </a>

          <button
            type="button"
            onClick={() => {
              setLoaded(true);
              setOpen(true);
            }}
            aria-label="Chat với tư vấn viên"
            title="Chat với tư vấn viên"
            className="group flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-[#1b6f48] p-1.5 text-white shadow-lg shadow-primary/30 transition-transform active:scale-95 md:pr-4"
          >
            <span className="relative flex size-11 items-center justify-center rounded-full bg-white/15">
              <MessageCircleMore className="size-6" />
              <span className="absolute right-1 top-1 flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-300" />
              </span>
            </span>
            <span className="hidden text-sm font-semibold md:inline">Chat với tư vấn viên</span>
          </button>
        </div>
      )}

      {loaded && <ChatWidget mode={mode} storageKey={storageKey} open={open} onClose={close} />}
    </>
  );
}
