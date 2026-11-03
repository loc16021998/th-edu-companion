"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Headset, Loader2, Phone, RotateCcw, SendHorizontal, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORGANIZATION } from "@/config/constants";
import { cn } from "@/lib/utils";
import { MAX_CHAT_MESSAGE, type ChatMessage } from "../schema";
import { splitEscalation } from "../knowledge-shared";
import { ManagerConnect } from "./manager-connect";
import { ZaloIcon, ZALO_URL } from "./zalo";

export type ChatMode = "public" | "parent" | "teacher";

const CONFIG: Record<ChatMode, { endpoint: string; greeting: string; suggestions: string[]; audience?: "teacher" }> = {
  public: {
    endpoint: "/api/consult-chat",
    greeting: "Em là tư vấn viên tự động của TH EDU 👋 Anh/chị cần hỏi về lịch học, địa chỉ, học phí hay tài khoản đăng nhập ạ?",
    suggestions: ["Lịch học thế nào?", "Trung tâm ở đâu?", "Đăng ký cho con học thử", "Quên mật khẩu đăng nhập"],
  },
  teacher: {
    // API tư vấn chung, hướng dẫn thao tác cho giáo viên — không đọc dữ liệu học sinh
    endpoint: "/api/consult-chat",
    audience: "teacher",
    greeting: "Em là tư vấn viên tự động của TH EDU 👋 Thầy/cô cần hướng dẫn điểm danh, viết sổ liên lạc, thêm ảnh/video hay đổi mật khẩu ạ?",
    suggestions: ["Cách điểm danh học sinh", "Cách viết sổ liên lạc", "Tải ảnh/video bị lỗi", "Quên mật khẩu"],
  },
  parent: {
    endpoint: "/api/parent-chat",
    greeting:
      "Em là Trợ lý AI của TH EDU 👋 Ba mẹ hỏi em về học phí, lịch học, chuyên cần, nhận xét của cô, quy định của trung tâm hay cách đồng hành cùng con học ở nhà nhé.",
    suggestions: [
      "Học phí tháng này đóng đến hạn nào?",
      "Bé nghỉ học có được học bù không?",
      "Cách cầm bút đúng chuẩn cho bé học Luyện chữ đẹp?",
      "Tuần này cô nhận xét con thế nào?",
    ],
  },
};

/**
 * Chat với tư vấn viên — ƯU TIÊN TRẢ LỜI TỰ ĐỘNG (trợ lý AI hoặc câu trả lời soạn sẵn).
 * Luôn có lối gặp người thật: Zalo trung tâm / hotline ở đầu khung chat.
 */
export function ChatWidget({
  mode,
  storageKey,
  open,
  onClose,
  variant = "floating",
}: {
  mode: ChatMode;
  /** "page": hiển thị trong trang (/parent/ai-assistant) thay vì cửa sổ nổi */
  variant?: "floating" | "page";
  /** Khoá sessionStorage giữ hội thoại khi chuyển trang / tải lại */
  storageKey: string;
  open: boolean;
  onClose: () => void;
}) {
  const { endpoint, greeting, suggestions, audience } = CONFIG[mode];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Phụ huynh mở "Quản lý cơ sở" ở đầu khung chat */
  const [connectOpen, setConnectOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Giữ hội thoại khi tải lại trang (trong cùng tab) — lỗi storage thì bỏ qua
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[]);
    } catch {
      // sessionStorage bị chặn / dữ liệu hỏng
    }
  }, [storageKey]);
  useEffect(() => {
    if (streaming) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      // bỏ qua
    }
  }, [messages, streaming, storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming, open]);

  useEffect(() => {
    if (!open || variant === "page") return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, variant]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;
      if (!navigator.onLine) {
        setError("Không có kết nối mạng. Vui lòng thử lại khi có mạng.");
        return;
      }
      setError(null);
      setInput("");

      const history: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let answer = "";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Bỏ các câu trả lời rỗng (bị dừng giữa chừng) khỏi lịch sử gửi lên
          body: JSON.stringify({
            messages: history.map((m) => ({ ...m, content: splitEscalation(m.content).text })).filter((m) => m.content.trim()),
            ...(audience && { audience }),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Tư vấn tự động đang gặp sự cố, vui lòng thử lại hoặc chat Zalo với trung tâm.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages([...history, { role: "assistant", content: answer }]);
        }
        answer += decoder.decode();
        setMessages([...history, { role: "assistant", content: answer.trim() || "Xin lỗi, em chưa có câu trả lời." }]);
      } catch (err) {
        if (controller.signal.aborted) {
          // Người dùng bấm dừng: giữ phần đã trả lời
          setMessages(answer.trim() ? [...history, { role: "assistant", content: `${answer.trim()} …` }] : history);
        } else {
          setMessages(history);
          setError(err instanceof Error ? err.message : "Không gửi được câu hỏi.");
          setInput(question); // cho phép gửi lại
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [endpoint, audience, messages, streaming],
  );

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setConnectOpen(false);
  }
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (!open) return null;

  const lastIsPendingAssistant = streaming && messages[messages.length - 1]?.content === "";
  const hotline = ORGANIZATION.phones[0];

  return (
    <div
      {...(variant === "floating" ? { role: "dialog", "aria-modal": true } : { role: "region" })}
      aria-label={mode === "parent" ? "Trợ lý AI hỏi – đáp" : "Chat với tư vấn viên"}
      className={
        variant === "floating"
          ? "fixed inset-0 z-50 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] animate-in fade-in slide-in-from-bottom-4 md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,calc(100dvh-3rem))] md:w-[400px] md:overflow-hidden md:rounded-2xl md:pb-0 md:pt-0 md:shadow-2xl md:ring-1 md:ring-border"
          : "flex h-[calc(100dvh-15.5rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] min-h-[26rem] flex-col overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border md:h-[calc(100dvh-10rem)]"
      }
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-[#1b6f48] text-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="relative flex size-9 items-center justify-center rounded-full bg-white/20">
            <Bot className="size-5" />
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-300 ring-2 ring-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">{mode === "parent" ? "Trợ lý AI TH EDU" : "Tư vấn viên TH EDU"}</p>
            <p className="text-xs text-white/80">{streaming ? "Đang trả lời..." : "Trả lời tự động 24/7"}</p>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={reset} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới" className="rounded-full p-2 hover:bg-white/15">
              <RotateCcw className="size-5" />
            </button>
          )}
          {variant === "floating" && (
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-2 hover:bg-white/15">
              <X className="size-5" />
            </button>
          )}
        </div>
        {/* Gặp người thật */}
        <div className="flex flex-wrap items-center gap-2 whitespace-nowrap border-t border-white/15 px-4 py-2 text-xs">
          {mode !== "parent" && <span className="text-white/80">Cần gặp tư vấn viên?</span>}
          {mode === "parent" && (
            <button
              type="button"
              onClick={() => setConnectOpen((v) => !v)}
              aria-expanded={connectOpen}
              className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2.5 py-1 font-semibold text-amber-950"
            >
              <Headset className="size-3.5" /> Quản lý cơ sở
            </button>
          )}
          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-[#0068FF]"
          >
            <ZaloIcon className="size-3.5" /> Zalo
          </a>
          {hotline && (
            <a href={`tel:${hotline.tel}`} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-semibold">
              <Phone className="size-3.5" /> {hotline.display}
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4" aria-live="polite">
        <Bubble role="assistant" content={greeting} />
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="rounded-full border border-primary/30 bg-background px-3 py-1.5 text-left text-xs font-medium text-primary active:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {connectOpen && mode === "parent" && <ManagerConnect question={lastQuestion} transcript={messages} />}
        {messages.map((m, i) => {
          if (m.role === "assistant" && m.content === "") return null;
          const { text, escalate } = m.role === "assistant" ? splitEscalation(m.content) : { text: m.content, escalate: false };
          const finished = !(streaming && i === messages.length - 1);
          const askedBefore = messages.slice(0, i).reverse().find((x) => x.role === "user")?.content ?? "";
          return (
            <div key={i} className="space-y-2">
              <Bubble role={m.role} content={text} />
              {/* Trợ lý đề nghị gặp người thật → nút kết nối Quản lý cơ sở (phụ huynh) / Zalo, hotline (khách) */}
              {escalate && finished && (mode === "parent" ? <ManagerConnect question={askedBefore} transcript={messages.slice(0, i + 1)} compact /> : null)}
            </div>
          );
        })}
        {lastIsPendingAssistant && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang soạn câu trả lời...
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="space-y-1.5 border-t bg-background p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={MAX_CHAT_MESSAGE}
            placeholder="Nhập câu hỏi..."
            aria-label="Câu hỏi cho tư vấn viên"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base shadow-sm [field-sizing:content] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          />
          {streaming ? (
            <Button type="button" size="icon" variant="outline" className="size-11 shrink-0 rounded-xl" onClick={() => abortRef.current?.abort()} aria-label="Dừng trả lời">
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-11 shrink-0 rounded-xl" disabled={!input.trim()} aria-label="Gửi">
              <SendHorizontal />
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">Câu trả lời tự động có thể chưa chính xác — thông tin chính thức vui lòng hỏi trung tâm.</p>
      </form>
    </div>
  );
}

function Bubble({ role, content }: ChatMessage) {
  const mine = role === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-border",
        )}
      >
        {content}
      </p>
    </div>
  );
}
