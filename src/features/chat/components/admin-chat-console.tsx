"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Clock, ImagePlus, Loader2, MessageCircle, Phone, Search, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { fieldClass } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { getBrowserClient, useIdleRealtime } from "@/lib/supabase/lazy-client";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/shared/media-image";
import { relativeTime } from "@/features/notifications/format";
import { prepareImage } from "@/features/daily-reports/upload";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";
import { adminSendChatMessage, removeChatMessage } from "../admin-actions";
import type { AdminConversation, AdminMessage } from "../admin-queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const CHAT_BUCKET = "chat";
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const EMOJIS = ["😊", "🙏", "👍", "👏", "❤️", "🌟", "🎉", "📚", "✏️", "🏫", "📅", "✅", "⚠️", "📞", "🤗", "💪"];
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

function MessageImage({ path, url }: { path: string; url: string | null }) {
  const [src, setSrc] = useState(url);
  useEffect(() => {
    if (src) return;
    let alive = true;
    void getBrowserClient()
      .then((supabase) => supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600))
      .then(({ data }) => alive && data?.signedUrl && setSrc(data.signedUrl));
    return () => {
      alive = false;
    };
  }, [path, src]);
  if (!src) return <span className="flex h-32 w-40 items-center justify-center rounded-xl bg-black/10"><Loader2 className="size-5 animate-spin" /></span>;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <MediaImage src={src} alt="Hình ảnh trong tin nhắn" width={480} height={360} sizes="(min-width: 768px) 320px, 70vw" className="max-h-60 max-w-full rounded-xl object-cover h-auto w-auto" />
    </a>
  );
}

type Pending = AdminMessage & { status?: "sending" | "failed" };

function Transcript({ conversation, initial, me }: { conversation: AdminConversation; initial: AdminMessage[]; me: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Pending[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Gửi: hiện ngay bản tạm, thay bằng bản thật khi server trả về (realtime tới trước cũng không bị trùng). */
  function send(body: string, imagePath: string | null) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, senderId: me, body: body || null, imagePath, imageUrl: null, createdAt: new Date().toISOString(), removedAt: null, status: "sending" },
    ]);
    startTransition(async () => {
      const res = await adminSendChatMessage({ conversationId: conversation.id, body, imagePath });
      if (!res.ok) {
        setError(res.error);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
        return;
      }
      setMessages((prev) => {
        const rest = prev.filter((m) => m.id !== tempId);
        return rest.some((m) => m.id === res.data.id) ? rest : [...rest, { ...res.data, imageUrl: null, removedAt: null }];
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
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
      const path = `${conversation.id}/${crypto.randomUUID()}.${ext}`;
      const supabase = await getBrowserClient();
      const { error: upError } = await supabase.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (upError) throw new Error("Không tải được ảnh lên (database đã chạy apply-admin-chat-reply.sql chưa?).");
      send("", path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được ảnh.");
    } finally {
      setUploading(false);
    }
  }

  // Theo dõi trực tiếp: tin mới + tin bị gỡ
  useIdleRealtime(`admin-chat:${conversation.id}`, (supabase) =>
    supabase
      .channel(`admin-chat:${conversation.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const m = payload.new as { id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string; removed_at?: string | null };
        if (!m?.id) return;
        setMessages((prev) => {
          const next: AdminMessage = { id: m.id, senderId: m.sender_id, body: m.body, imagePath: m.image_path, imageUrl: null, createdAt: m.created_at, removedAt: m.removed_at ?? null };
          return prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? { ...x, ...next, imageUrl: next.imagePath ? x.imageUrl : null } : x)) : [...prev, next];
        });
      })
      .subscribe(),
  );

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  async function remove(m: AdminMessage) {
    if (!(await confirmSheet({ title: "Gỡ tin nhắn này?", description: "Nội dung (và ảnh) sẽ bị xoá, hai bên chỉ thấy “Tin nhắn đã bị quản trị viên gỡ”.", confirmLabel: "Gỡ tin nhắn", tone: "danger" }))) return;
    setError(null);
    setRemoving(m.id);
    startTransition(async () => {
      const res = await removeChatMessage(m.id);
      setRemoving(null);
      if (!res.ok) return setError(res.error);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: null, imagePath: null, removedAt: new Date().toISOString() } : x)));
      router.refresh();
    });
  }

  /** Người gửi: phụ huynh / giáo viên trong cuộc, hoặc quản trị viên (hai bên thấy là "Trung tâm TH EDU"). */
  const senderOf = (senderId: string) =>
    senderId === conversation.teacher.id
      ? { label: `GV · ${conversation.teacher.name}`, kind: "teacher" as const }
      : senderId === conversation.parent.id
        ? { label: `PH · ${conversation.parent.name}`, kind: "parent" as const }
        : { label: senderId === me ? "Trung tâm · Bạn" : "Trung tâm · Quản trị viên", kind: "center" as const };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Đã mở cuộc trò chuyện → thông báo "Tin nhắn" của cuộc này trên chuông coi như đã xem */}
      <AdminFeedMarkRead groupKey={`chat:${conversation.id}`} version={messages.length} />
      <header className="space-y-1 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/admin/chat" className="-ml-1 rounded-full p-1.5 hover:bg-muted lg:hidden" aria-label="Quay lại danh sách">
            <ArrowLeft className="size-5" />
          </Link>
          <p className="min-w-0 flex-1 break-words font-bold">
            <span className="text-sky-700">{conversation.parent.name}</span> ↔ <span className="text-emerald-700">{conversation.teacher.name}</span>
          </p>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Bé: {conversation.children.map((c) => `${c.name} (${c.className})`).join(", ") || "—"}</span>
          {conversation.parent.phone && (
            <a href={`tel:${conversation.parent.phone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="size-3" /> PH {conversation.parent.phone.replace(/^\+?84/, "0")}
            </a>
          )}
          {conversation.teacher.phone && (
            <a href={`tel:${conversation.teacher.phone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="size-3" /> GV {conversation.teacher.phone.replace(/^\+?84/, "0")}
            </a>
          )}
        </p>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-3">
        {messages.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">Chưa có tin nhắn.</p>}
        {messages.map((m, i) => {
          const sender = senderOf(m.senderId);
          const isCenter = sender.kind === "center";
          const newDay = i === 0 || dayKey(messages[i - 1]!.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-xs font-semibold capitalize text-muted-foreground">{dayFmt.format(new Date(m.createdAt))}</p>}
              <div className={cn("group flex items-start gap-2", isCenter ? "flex-row-reverse" : "")}>
                <div
                  className={cn(
                    "max-w-[78%] space-y-1 rounded-2xl px-3 py-2 text-sm shadow-sm ring-1",
                    sender.kind === "teacher" && "rounded-tl-md bg-emerald-50 ring-emerald-100",
                    sender.kind === "parent" && "rounded-tl-md bg-card ring-border",
                    isCenter && "rounded-tr-md bg-violet-50 ring-violet-200",
                    m.removedAt && "bg-muted/60 ring-border",
                    m.status === "sending" && "opacity-70",
                    m.status === "failed" && "ring-destructive",
                  )}
                >
                  <p className={cn("text-xs font-bold", sender.kind === "teacher" ? "text-emerald-700" : sender.kind === "parent" ? "text-sky-700" : "text-violet-700")}>
                    {isCenter ? "🏫 " : ""}
                    {sender.label}
                  </p>
                  {m.removedAt ? (
                    <p className="italic text-muted-foreground">🚫 Đã gỡ lúc {timeFmt.format(new Date(m.removedAt))}</p>
                  ) : (
                    <>
                      {m.imagePath && <MessageImage path={m.imagePath} url={m.imageUrl} />}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </>
                  )}
                  <p className="text-right text-xs text-muted-foreground">
                    {m.status === "sending" ? "Đang gửi…" : m.status === "failed" ? "Gửi lỗi" : timeFmt.format(new Date(m.createdAt))}
                  </p>
                </div>
                {!m.removedAt && !m.status && (
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    disabled={removing === m.id}
                    className="mt-1 rounded-full p-1.5 text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Gỡ tin nhắn"
                    title="Gỡ tin nhắn không phù hợp"
                  >
                    {removing === m.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                )}
              </div>
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
        <p role="alert" className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Đóng">
            <X className="size-4" />
          </button>
        </p>
      )}
      <form onSubmit={submit} className="border-t bg-card p-2">
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">
          Trả lời với tư cách <b className="text-violet-700">Trung tâm TH EDU</b> — phụ huynh và giáo viên đều thấy tin và nhận thông báo.
        </p>
        <div className="flex items-end gap-1.5">
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
            placeholder="Nhập tin trả lời…"
            aria-label="Nội dung tin nhắn"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          />
          <button type="submit" disabled={!text.trim()} className="rounded-full bg-primary p-2.5 text-primary-foreground transition-opacity disabled:opacity-40" aria-label="Gửi">
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

/** Bảng điều khiển chat của quản trị: lọc theo cơ sở / lớp / tên, cuộc trò chuyện chờ cô trả lời, xem, trả lời & gỡ tin. */
export function AdminChatConsole({
  me,
  conversations,
  active,
}: {
  /** id quản trị viên đang đăng nhập (để nhận ra tin của chính mình) */
  me: string;
  conversations: AdminConversation[];
  active: { conversation: AdminConversation; messages: AdminMessage[] } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("all");
  const [className, setClassName] = useState("all");
  const [awaitingOnly, setAwaitingOnly] = useState(false);

  // Có tin mới ở bất kỳ cuộc trò chuyện nào → cập nhật danh sách
  useIdleRealtime("admin-chat-inbox", (supabase) =>
    supabase
      .channel("admin-chat-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 600);
      })
      .subscribe(),
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const classOptions = useMemo(
    () => [...new Set(conversations.flatMap((c) => c.children.filter((k) => campus === "all" || k.campus === campus).map((k) => k.className)))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
    [conversations, campus],
  );

  const shown = conversations.filter((c) => {
    const q = query.trim().toLocaleLowerCase("vi");
    if (awaitingOnly && !c.awaitingTeacher) return false;
    if (campus !== "all" && !c.children.some((k) => k.campus === campus)) return false;
    if (className !== "all" && !c.children.some((k) => k.className === className && (campus === "all" || k.campus === campus))) return false;
    if (!q) return true;
    return [c.parent.name, c.teacher.name, ...c.children.map((k) => k.name), c.parent.phone ?? "", c.teacher.phone ?? ""].some((v) => v.toLocaleLowerCase("vi").includes(q));
  });

  return (
    <div className="grid h-[calc(100dvh-3.5rem-12rem-env(safe-area-inset-top))] min-h-[30rem] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border lg:h-[calc(100dvh-3.5rem-10rem)] lg:grid-cols-[22rem_1fr]">
      <aside className={cn("flex min-h-0 flex-col border-r", active && "hidden lg:flex")} aria-label="Danh sách trò chuyện">
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên phụ huynh, giáo viên, học sinh, SĐT…" aria-label="Tìm trò chuyện" className={cn(fieldClass, "h-10 pl-9")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={campus}
              onChange={(e) => {
                setCampus(e.target.value);
                setClassName("all");
              }}
              aria-label="Lọc theo cơ sở"
              className={cn(fieldClass, "h-10")}
            >
              <option value="all">Mọi cơ sở</option>
              {Object.entries(CAMPUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select value={className} onChange={(e) => setClassName(e.target.value)} aria-label="Lọc theo lớp" className={cn(fieldClass, "h-10")}>
              <option value="all">Mọi lớp</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  Lớp {c}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={awaitingOnly} onChange={(e) => setAwaitingOnly(e.target.checked)} className="size-4 accent-primary" />
            Chỉ hiện phụ huynh đang chờ cô trả lời
          </label>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {shown.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">{conversations.length === 0 ? "Chưa có cuộc trò chuyện nào." : "Không có cuộc trò chuyện phù hợp."}</li>
          ) : (
            shown.map((c) => {
              const isActive = active?.conversation.id === c.id;
              return (
                <li key={c.id}>
                  <Link
                    href={`${pathname}?c=${c.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn("block space-y-0.5 px-3 py-2.5 transition-colors hover:bg-muted/60", isActive && "bg-primary/5")}
                  >
                    <p className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 break-words font-semibold">
                        <span className="text-sky-700">{c.parent.name}</span> ↔ <span className="text-emerald-700">{c.teacher.name}</span>
                      </span>
                      {c.lastMessageAt && <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.lastMessageAt)}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{c.children.map((k) => `${k.name} · ${k.className}`).join(", ") || "—"}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs">
                      {c.awaitingTeacher && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                          <Clock className="size-3" /> Chờ cô trả lời
                        </span>
                      )}
                      <span className="truncate text-muted-foreground">{c.preview}</span>
                    </p>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </aside>
      <section className={cn("min-h-0", !active && "hidden lg:flex lg:items-center lg:justify-center")}>
        {active ? (
          <Transcript key={active.conversation.id} conversation={active.conversation} initial={active.messages} me={me} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="size-5" /> Chọn một cuộc trò chuyện để xem
          </p>
        )}
      </section>
    </div>
  );
}
