"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Images, Loader2, MessageCircle, MoreHorizontal, Play, SendHorizontal, Tags, Trash2, X } from "lucide-react";
import { MediaImage } from "@/components/shared/media-image";
import { getBrowserClient, useIdleRealtime } from "@/lib/supabase/lazy-client";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/features/notifications/format";
import { addMomentComment, deleteMoment, deleteMomentComment, toggleReaction } from "../actions";
import { MOMENTS_BUCKET, MOMENT_CATEGORIES, type MomentCategory } from "../constants";
import type { MomentComment, MomentItem, MomentMediaItem } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { haptic } from "@/components/ui/toast";
import { playAnimation } from "@/lib/motion";

type Viewer = { id: string; canManage: boolean; myChildIds: string[] };

/** Tải ảnh / video GỐC (chất lượng cao) bằng URL ký có Content-Disposition: attachment — 1 chạm là lưu về máy. */
async function downloadOriginal(item: MomentMediaItem) {
  const supabase = await getBrowserClient();
  const ext = item.path.split(".").pop() ?? "jpg";
  const { data } = await supabase.storage.from(MOMENTS_BUCKET).createSignedUrl(item.path, 120, { download: `th-edu-khoanh-khac-${item.id.slice(0, 8)}.${ext}` });
  if (data?.signedUrl) window.location.href = data.signedUrl;
}

function Viewer({ media, index, onClose, myChildIds }: { media: MomentMediaItem[]; index: number; onClose: () => void; myChildIds: string[] }) {
  const [i, setI] = useState(index);
  const [saving, setSaving] = useState(false);
  const item = media[i]!;
  const go = (d: number) => setI((x) => (x + d + media.length) % media.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go dùng setState dạng hàm
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Xem ảnh khoảnh khắc">
      <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm tabular-nums text-white/70">
          {i + 1}/{media.length}
        </span>
        <button
          type="button"
          onClick={() => {
            setSaving(true);
            void downloadOriginal(item).finally(() => setTimeout(() => setSaving(false), 1500));
          }}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Tải {item.kind === "video" ? "video" : "ảnh"} gốc
        </button>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/15" aria-label="Đóng">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {item.kind === "video" ? (
          item.url && <video key={item.url} src={item.url} controls autoPlay playsInline className="absolute inset-0 m-auto max-h-full max-w-full" />
        ) : (
          item.url && <MediaImage key={item.url} src={item.url} alt="Ảnh khoảnh khắc" fill sizes="100vw" priority className="object-contain" />
        )}
        {media.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2" aria-label="Ảnh trước">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2" aria-label="Ảnh sau">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      {item.tags.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
          <Tags className="size-4 text-pink-300" />
          {item.tags.map((t) => (
            <span key={t.studentId} className={cn("rounded-full px-2 py-0.5", myChildIds.includes(t.studentId) ? "bg-pink-500 font-bold" : "bg-white/15")}>
              {t.name}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Gallery({ media, onOpen }: { media: MomentMediaItem[]; onOpen: (i: number) => void }) {
  // Số ô luôn lấp kín lưới: 1 | 2 | 4 (2×2) | 3 (1 lớn + 2) | 6 (1 lớn + 2 + hàng 3) — phần còn lại hiện "+N"
  const n = media.length;
  const count = n <= 2 || n === 4 ? n : n >= 6 ? 6 : 3;
  const tiles = media.slice(0, count);
  const more = n - tiles.length;
  const featured = count === 3 || count === 6;
  const layout = count === 1 ? "grid-cols-1" : featured ? "grid-cols-3" : "grid-cols-2";
  return (
    <ul className={cn("grid gap-1 overflow-hidden rounded-xl", layout)}>
      {tiles.map((m, i) => (
        <li key={m.id} className={cn("relative", featured && i === 0 && "col-span-2 row-span-2")}>
          <button type="button" onClick={() => onOpen(i)} className={cn("relative block w-full overflow-hidden bg-muted", media.length === 1 ? "aspect-[4/3]" : "aspect-square")} aria-label={`Xem ${m.kind === "video" ? "video" : "ảnh"} ${i + 1}`}>
            {m.url &&
              (m.kind === "video" ? (
                <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none size-full object-cover" />
              ) : (
                <MediaImage src={m.url} alt="" fill sizes={media.length === 1 ? "(min-width: 768px) 640px, 100vw" : "(min-width: 768px) 320px, 50vw"} className="object-cover" />
              ))}
            {m.kind === "video" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-slate-900">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
              </span>
            )}
            {i === tiles.length - 1 && more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-bold text-white">+{more}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Comments({ moment, viewer }: { moment: MomentItem; viewer: Viewer }) {
  const [list, setList] = useState<MomentComment[]>(moment.comments);
  const [all, setAll] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => setList(moment.comments), [moment.comments]);
  const shown = all ? list : list.slice(-3);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    setText("");
    startTransition(async () => {
      const res = await addMomentComment(moment.id, body);
      if (!res.ok) {
        setText(body);
        return setError(res.error);
      }
      setList((prev) => (prev.some((c) => c.id === res.data.id) ? prev : [...prev, res.data]));
    });
  }

  async function remove(id: string) {
    if (!(await confirmSheet({ title: "Xoá bình luận này?", confirmLabel: "Xoá", tone: "danger" }))) return;
    setList((prev) => prev.filter((c) => c.id !== id));
    void deleteMomentComment(id);
  }

  return (
    <div className="space-y-2">
      {list.length > 3 && !all && (
        <button type="button" onClick={() => setAll(true)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Xem tất cả {list.length} bình luận
        </button>
      )}
      {shown.map((c) => (
        <div key={c.id} className="group flex items-start gap-2">
          <div className="min-w-0 flex-1 rounded-2xl bg-muted/70 px-3 py-1.5">
            <p className={cn("text-xs font-bold", c.authorRole === "parent" ? "text-sky-700" : "text-emerald-700")}>{c.authorLabel}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
          </div>
          <span className="mt-1.5 shrink-0 text-xs text-muted-foreground">{relativeTime(c.createdAt)}</span>
          {(c.authorId === viewer.id || viewer.canManage) && (
            <button type="button" onClick={() => remove(c.id)} className="mt-1 rounded p-1 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100" aria-label="Xoá bình luận">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Viết lời động viên…"
          aria-label="Bình luận"
          className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
        <button type="submit" disabled={!text.trim() || pending} className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-40" aria-label="Gửi bình luận">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MomentCard({ moment, viewer }: { moment: MomentItem; viewer: Viewer }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [reactions, setReactions] = useState(moment.reactions);
  const [burst, setBurst] = useState(0);
  const [menu, setMenu] = useState(false);
  const [, startTransition] = useTransition();
  useEffect(() => setReactions(moment.reactions), [moment.reactions]);
  const cat = MOMENT_CATEGORIES[moment.category as MomentCategory] ?? MOMENT_CATEGORIES.class;
  const myKids = moment.tagged.filter((t) => viewer.myChildIds.includes(t.studentId));

  function react(kind: "heart" | "like") {
    const was = reactions.mine[kind];
    setReactions((r) => ({ ...r, [kind]: r[kind] + (was ? -1 : 1), mine: { ...r.mine, [kind]: !was } }));
    startTransition(async () => {
      const res = await toggleReaction(moment.id, kind);
      if (!res.ok) setReactions((r) => ({ ...r, [kind]: r[kind] + (was ? 1 : -1), mine: { ...r.mine, [kind]: was } }));
    });
  }

  async function remove() {
    setMenu(false);
    if (!(await confirmSheet({ title: "Xoá bài đăng này?", description: "Xoá cùng toàn bộ ảnh / video, cảm xúc và bình luận.", confirmLabel: "Xoá bài", tone: "danger" }))) return;
    startTransition(async () => {
      await deleteMoment(moment.id);
      router.refresh();
    });
  }

  return (
    <article id={`moment-${moment.id}`} className="scroll-mt-24 space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border target:ring-2 target:ring-pink-400">
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700" aria-hidden>
          {(moment.authorName.trim().split(/\s+/).at(-1) ?? "C")[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold">{moment.authorName || "Giáo viên"}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {relativeTime(moment.publishedAt)}
            <span>·</span>
            <span>
              {cat.emoji} {cat.label}
            </span>
            {moment.visibility === "tagged" && <span className="rounded-full bg-pink-50 px-1.5 font-semibold text-pink-700 ring-1 ring-pink-200">Nhóm nhỏ</span>}
          </p>
        </div>
        {viewer.canManage && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-full p-1.5 hover:bg-muted" aria-label="Tuỳ chọn">
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl bg-card p-1 shadow-lg ring-1 ring-border">
                <button type="button" onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-4" /> Xoá bài
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {moment.caption && <p className="whitespace-pre-line text-sm leading-relaxed">{moment.caption}</p>}
      {moment.media.length > 0 && <Gallery media={moment.media} onOpen={setOpen} />}

      {moment.tagged.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <Tags className="size-3.5 text-pink-500" />
          {moment.tagged.map((t) => (
            <span key={t.studentId} className={cn("rounded-full px-2 py-0.5 font-semibold", viewer.myChildIds.includes(t.studentId) ? "bg-pink-500 text-white" : "bg-muted text-muted-foreground")}>
              {t.name}
            </span>
          ))}
          {myKids.length > 0 && <span className="text-pink-600">· Có bé nhà mình 💕</span>}
        </p>
      )}

      <div className="flex items-center gap-1 border-t pt-2">
        <button
          type="button"
          onClick={(e) => {
            // Thả tim → trái tim "bật" + vòng sáng lan ra (bỏ thả thì không)
            if (!reactions.mine.heart) {
              playAnimation(e.currentTarget.querySelector("[data-emoji]"), "animate-heart-pop");
              setBurst((b) => b + 1);
              haptic("tap");
            }
            react("heart");
          }}
          aria-pressed={reactions.mine.heart}
          aria-label={reactions.mine.heart ? "Bỏ thả tim" : "Thả tim"}
          className={cn("tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", reactions.mine.heart ? "bg-rose-50 text-rose-600" : "hover:bg-muted")}
        >
          <span className="relative inline-flex">
            {burst > 0 && reactions.mine.heart && <span key={burst} aria-hidden className="absolute inset-0 animate-ping-once rounded-full bg-rose-400/60" />}
            <span data-emoji className="relative text-base">
              {reactions.mine.heart ? "❤️" : "🤍"}
            </span>
          </span>{" "}
          {reactions.heart || ""}
        </button>
        <button
          type="button"
          onClick={(e) => {
            if (!reactions.mine.like) playAnimation(e.currentTarget.querySelector("[data-emoji]"), "animate-bounce-in");
            react("like");
          }}
          aria-pressed={reactions.mine.like}
          aria-label={reactions.mine.like ? "Bỏ thích" : "Thích"}
          className={cn("tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", reactions.mine.like ? "bg-sky-50 text-sky-700" : "hover:bg-muted")}
        >
          <span data-emoji className="inline-block text-base">
            👍
          </span>{" "}
          {reactions.like || ""}
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MessageCircle className="size-3.5" /> {moment.comments.length} bình luận
        </span>
      </div>

      <Comments moment={moment} viewer={viewer} />
      {open !== null && <Viewer media={moment.media} index={open} onClose={() => setOpen(null)} myChildIds={viewer.myChildIds} />}
    </article>
  );
}

/** Bảng tin khoảnh khắc: bài mới / bình luận / cảm xúc của người khác hiện ngay (Supabase Realtime). */
export function MomentFeed({ items, viewer, moreHref }: { items: MomentItem[]; viewer: Viewer; moreHref: string | null }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime nạp sau khi trang đã hiện (không chặn lần tải đầu)
  useIdleRealtime("moments-feed", (supabase) => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
    };
    return supabase
      .channel("moments-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "moments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "moment_comments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "moment_reactions" }, refresh)
      .subscribe();
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
        <Images className="size-10 text-muted-foreground" />
        <p className="mt-2 font-semibold">Chưa có khoảnh khắc nào</p>
        <p className="mt-1 text-sm text-muted-foreground">Ảnh / video hoạt động của lớp sẽ hiện ở đây.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((m) => (
        <MomentCard key={m.id} moment={m} viewer={viewer} />
      ))}
      {moreHref && (
        <Link href={moreHref} className="block rounded-2xl bg-card py-3 text-center text-sm font-semibold text-primary ring-1 ring-border hover:bg-muted">
          Xem khoảnh khắc cũ hơn
        </Link>
      )}
    </div>
  );
}
