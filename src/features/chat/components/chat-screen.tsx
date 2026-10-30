"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, ImagePlus, Loader2, MessageCircle, SendHorizontal, Smile, X } from "lucide-react";
import { getBrowserClient, useIdleRealtime } from "@/lib/supabase/lazy-client";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/shared/media-image";
import { prepareImage } from "@/features/daily-reports/upload";
import { CHAT_READ_EVENT } from "@/lib/live-events";
import { sendChatMessage } from "../actions";
import type { ChatContact, ChatMessage } from "../queries";

const CHAT_BUCKET = "chat";
const EMOJIS = ["😀", "😊", "😍", "🥰", "😂", "😉", "👍", "👏", "🙏", "💪", "❤️", "🌟", "🎉", "📚", "✏️", "🏫", "🤒", "😷", "😢", "😴", "🤔", "👌", "🙌", "🌈"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.at(-1)?.[0] ?? "?").toUpperCase();
}

function Avatar({ name, role }: { name: string; role: "parent" | "teacher" }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        role === "teacher" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700",
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function ContactList({ contacts, activeId, basePath }: { contacts: ChatContact[]; activeId: string | null; basePath: string }) {
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <MessageCircle className="size-10 text-muted-foreground" />
        <p className="mt-2 font-semibold">Chưa có ai để nhắn tin</p>
        <p className="mt-1 text-sm text-muted-foreground">Chỉ nhắn được giữa phụ huynh và giáo viên phụ trách lớp của bé.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {contacts.map((c) => {
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <Link
              href={`${basePath}?with=${c.id}`}
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60", active && "bg-primary/5")}
            >
              <Avatar name={c.name} role={c.role} />
              <div className="min-w-0 flex-1">
                <p className={cn("flex items-center gap-2 break-words", c.conversation?.unread ? "font-extrabold" : "font-semibold")}>
                  <span className="break-words">{c.name}</span>
                  {c.conversation?.lastMessageAt && <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">{timeFmt.format(new Date(c.conversation.lastMessageAt))}</span>}
                </p>
                <p className={cn("truncate text-xs", c.conversation?.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {c.conversation?.preview ?? (c.role === "teacher" ? `Cô phụ trách lớp ${c.classes.join(", ")}` : `PH của ${c.children.join(", ")} · ${c.classes.join(", ")}`)}
                </p>
              </div>
              {c.conversation?.unread && <span className="size-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Có tin chưa đọc" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Ảnh trong tin: URL ký sẵn từ server, tin mới đến qua realtime thì tự ký bằng phiên của người xem (RLS). */
function MessageImage({ path, url }: { path: string; url: string | null }) {
  const [src, setSrc] = useState(url);
  useEffect(() => {
    if (src) return;
    let alive = true;
    void getBrowserClient()
      .then((supabase) => supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 60 * 60))
      .then(({ data }) => alive && data?.signedUrl && setSrc(data.signedUrl));
    return () => {
      alive = false;
    };
  }, [path, src]);
  if (!src) return <span className="flex h-40 w-48 items-center justify-center rounded-xl bg-black/10"><Loader2 className="size-5 animate-spin" /></span>;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <MediaImage src={src} alt="Hình ảnh trong tin nhắn" width={480} height={360} sizes="(min-width: 768px) 320px, 70vw" className="max-h-72 max-w-full rounded-xl object-cover h-auto w-auto" />
    </a>
  );
}

type Pending = ChatMessage & { status?: "sending" | "failed" };

function Thread({
  me,
  contact,
  conversationId,
  initialMessages,
  initialOtherReadAt,
  basePath,
}: {
  me: string;
  contact: ChatContact;
  conversationId: string;
  initialMessages: ChatMessage[];
  initialOtherReadAt: string | null;
  basePath: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Pending[]>(initialMessages);
  const [otherReadAt, setOtherReadAt] = useState(initialOtherReadAt);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Đã xem → ghi mốc đọc, rồi báo ngay cho menu (huy hiệu) và danh sách (chấm chưa đọc) cập nhật
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void getBrowserClient()
      .then((supabase) => supabase.rpc("chat_mark_read", { p_conversation: conversationId }))
      .then(({ error }) => {
        if (error) return console.warn("[chat] Không đánh dấu đã đọc:", error.message);
        window.dispatchEvent(new Event(CHAT_READ_EVENT));
        router.refresh();
      });
  }, [conversationId, router]);

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => {
      document.removeEventListener("visibilitychange", markRead);
      router.refresh(); // cập nhật danh sách (đã đọc) khi rời cuộc trò chuyện
    };
  }, [conversationId, markRead, router]);

  // Tin mới (của mình hoặc của bên kia) + mốc "đã xem" của bên kia — realtime (nạp sau khi trang hiện)
  useIdleRealtime(`chat:${conversationId}`, (supabase) =>
    supabase
      .channel(`chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as { id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string };
        setMessages((prev) =>
          prev.some((x) => x.id === m.id)
            ? prev
            : [...prev, { id: m.id, senderId: m.sender_id, body: m.body, imagePath: m.image_path, imageUrl: null, createdAt: m.created_at }],
        );
        if (m.sender_id !== me) markRead();
      })
      // Quản trị viên gỡ tin → ẩn nội dung ngay
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as { id: string; removed_at: string | null };
        if (m.removed_at) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, removed: true, body: null, imagePath: null } : x)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_conversations", filter: `id=eq.${conversationId}` }, (payload) => {
        const c = payload.new as { parent_id: string; parent_last_read_at: string | null; teacher_last_read_at: string | null };
        setOtherReadAt(c.parent_id === me ? c.teacher_last_read_at : c.parent_last_read_at);
      })
      .subscribe(),
  );

  // Luôn cuộn xuống tin mới nhất
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  function send(body: string, imagePath: string | null) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, senderId: me, body: body || null, imagePath, imageUrl: null, createdAt: new Date().toISOString(), status: "sending" }]);
    startTransition(async () => {
      const res = await sendChatMessage({ conversationId, body, imagePath });
      if (!res.ok) {
        setError(res.error);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
        return;
      }
      // Realtime có thể đã thêm tin thật trước → bỏ bản tạm, tránh trùng
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === res.data.id) ? withoutTemp : [...withoutTemp, { ...res.data, imageUrl: null }];
      });
    });
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    setText("");
    setShowEmoji(false);
    send(body, null);
    input.current?.focus();
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Chỉ gửi được hình ảnh.");
    setUploading(true);
    try {
      const blob = await prepareImage(file);
      if (blob.size > MAX_IMAGE_BYTES) throw new Error("Ảnh quá lớn (tối đa 10MB).");
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
      const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
      const supabase = await getBrowserClient();
      const { error: upError } = await supabase.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (upError) throw new Error("Không tải được ảnh lên. Kiểm tra mạng rồi thử lại.");
      send("", path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được ảnh.");
    } finally {
      setUploading(false);
    }
  }

  const lastMine = [...messages].reverse().find((m) => m.senderId === me && !m.status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2.5">
        <Link href={basePath} className="-ml-1 rounded-full p-1.5 hover:bg-muted md:hidden" aria-label="Quay lại danh sách">
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar name={contact.name} role={contact.role} />
        <div className="min-w-0">
          <p className="break-words font-bold">{contact.name}</p>
          <p className="break-words text-xs text-muted-foreground">
            {contact.role === "teacher" ? `Giáo viên lớp ${contact.classes.join(", ")}` : `Phụ huynh ${contact.children.join(", ")} · ${contact.classes.join(", ")}`}
          </p>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 px-3 py-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="mx-auto mt-8 max-w-xs text-center text-sm text-muted-foreground">
            Bắt đầu trò chuyện với {contact.name}. Tin nhắn được gửi tức thì và chỉ hai bên xem được.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === me;
          // Không phải mình cũng không phải người kia → quản trị viên trả lời thay mặt trung tâm
          const center = !mine && m.senderId !== contact.id;
          const newDay = i === 0 || dayKey(messages[i - 1]!.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-xs font-semibold capitalize text-muted-foreground">{dayFmt.format(new Date(m.createdAt))}</p>}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] space-y-1 rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-border",
                    center && "bg-violet-50 ring-violet-200",
                    m.status === "sending" && "opacity-70",
                    m.status === "failed" && "bg-destructive/80",
                  )}
                >
                  {center && <p className="text-xs font-bold text-violet-700">🏫 Trung tâm TH EDU</p>}
                  {m.removed ? (
                    <p className="italic opacity-80">🚫 Tin nhắn đã bị quản trị viên gỡ</p>
                  ) : (
                    <>
                      {m.imagePath && <MessageImage path={m.imagePath} url={m.imageUrl} />}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                  <p className={cn("text-right text-xs", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {m.status === "sending" ? "Đang gửi…" : m.status === "failed" ? "Gửi lỗi" : timeFmt.format(new Date(m.createdAt))}
                  </p>
                </div>
              </div>
              {lastMine?.id === m.id && otherReadAt && otherReadAt >= m.createdAt && (
                <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  <CheckCheck className="size-3" /> Đã xem
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showEmoji && (
        <div className="grid grid-cols-8 gap-1 border-t bg-card p-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded-lg py-1.5 text-xl hover:bg-muted"
              onClick={() => {
                setText((t) => t + e);
                input.current?.focus();
              }}
              aria-label={`Chèn ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-2 border-t bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Đóng">
            <X className="size-4" />
          </button>
        </p>
      )}
      <form onSubmit={submit} className="flex items-end gap-1.5 border-t bg-card p-2">
        <button type="button" onClick={() => setShowEmoji((v) => !v)} className={cn("rounded-full p-2 hover:bg-muted", showEmoji && "text-primary")} aria-label="Biểu tượng cảm xúc">
          <Smile className="size-6" />
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="rounded-full p-2 hover:bg-muted disabled:opacity-50" aria-label="Gửi hình ảnh">
          {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Nhập tin nhắn…"
          aria-label="Nội dung tin nhắn"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
        <button type="submit" disabled={!text.trim()} className="rounded-full bg-primary p-2.5 text-primary-foreground transition-opacity disabled:opacity-40" aria-label="Gửi">
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </div>
  );
}

/** Hộp thoại chat: danh sách bên trái (máy tính) / màn riêng (điện thoại) + khung tin nhắn realtime. */
export function ChatScreen({
  me,
  contacts,
  active,
  basePath,
}: {
  me: string;
  contacts: ChatContact[];
  active: { contact: ChatContact; conversationId: string; messages: ChatMessage[]; otherReadAt: string | null } | null;
  basePath: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Danh sách: có tin mới ở cuộc trò chuyện khác → cập nhật xem trước + chấm chưa đọc (realtime nạp sau khi trang hiện)
  useIdleRealtime(`chat-inbox:${me}`, (supabase) =>
    supabase
      .channel(`chat-inbox:${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 500);
      })
      .subscribe(),
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="grid h-[calc(100dvh-3.5rem-3rem-5rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] min-h-[24rem] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border md:h-[calc(100dvh-3.5rem-3rem-env(safe-area-inset-top))] md:grid-cols-[18rem_1fr]">
      <aside className={cn("min-h-0 overflow-y-auto border-r", active && "hidden md:block")} aria-label="Danh sách trò chuyện">
        <ContactList contacts={contacts} activeId={active?.contact.id ?? null} basePath={basePath} />
      </aside>
      <section className={cn("min-h-0", !active && "hidden md:flex md:items-center md:justify-center")}>
        {active ? (
          <Thread
            key={active.conversationId}
            me={me}
            contact={active.contact}
            conversationId={active.conversationId}
            initialMessages={active.messages}
            initialOtherReadAt={active.otherReadAt}
            basePath={basePath}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="size-5" /> Chọn một người để bắt đầu trò chuyện
          </p>
        )}
      </section>
    </div>
  );
}
