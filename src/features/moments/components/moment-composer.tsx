"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, ImagePlus, Loader2, Play, Send, Tags, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaImage } from "@/components/shared/media-image";
import { getBrowserClient } from "@/lib/supabase/lazy-client";
import { compressImage } from "@/lib/images/compress";
import { cn, givenName } from "@/lib/utils";
import { extensionFor, mediaKind } from "@/features/daily-reports/upload";
import { createMomentDraft, deleteMoment, publishMoment } from "../actions";
import { MAX_MOMENT_MEDIA, MOMENTS_BUCKET, MOMENT_CATEGORIES, MOMENT_CATEGORY_KEYS, MOMENT_VISIBILITY, type MomentCategory, type MomentVisibility } from "../constants";
import { reportError } from "@/lib/monitoring/client";

type Student = { id: string; name: string };
type Item = { key: string; file: File; preview: string; kind: "image" | "video"; tags: Set<string>; progress: number };

const MAX_VIDEO = 100 * 1024 * 1024;

/**
 * Đăng khoảnh khắc: chuỗi ảnh/video + chú thích, chọn "Cả lớp" hoặc "Nhóm nhỏ", gắn thẻ học sinh trên từng ảnh.
 * Ảnh giữ chất lượng cao (≤ 2.5MB, cạnh dài ≤ 3200px — để phụ huynh tải ảnh gốc), video tải resumable.
 */
export function MomentComposer({ classKey, className, students }: { classKey: string; className: string; students: Student[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<MomentCategory>("class");
  const [visibility, setVisibility] = useState<MomentVisibility>("class");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Thu hồi ảnh xem trước khi rời khung đăng bài (tệp bị gỡ thì thu hồi ngay lúc gỡ)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: Item[] = [];
    for (const file of Array.from(list)) {
      const kind = mediaKind(file);
      if (!kind) continue;
      if (kind === "video" && file.size > MAX_VIDEO) {
        setError(`Video "${file.name}" vượt quá 100MB.`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), kind, tags: new Set(), progress: 0 });
    }
    setItems((prev) => [...prev, ...next].slice(0, MAX_MOMENT_MEDIA));
    if (!active && next[0]) setActive(next[0].key);
  }

  const toggleTag = (key: string, studentId: string) =>
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        const tags = new Set(i.tags);
        if (tags.has(studentId)) tags.delete(studentId);
        else tags.add(studentId);
        return { ...i, tags };
      }),
    );
  const tagAll = (studentId: string) => {
    const allHave = items.every((i) => i.tags.has(studentId));
    setItems((prev) => prev.map((i) => ({ ...i, tags: new Set(allHave ? [...i.tags].filter((x) => x !== studentId) : [...i.tags, studentId]) })));
  };

  async function uploadOne(momentId: string, item: Item): Promise<string> {
    const blob = item.kind === "image" ? await compressImage(item.file, { maxBytes: 2.5 * 1024 * 1024, maxDimension: 3200 }) : item.file;
    const ext = blob !== item.file ? "jpg" : (extensionFor(item.file, item.file.name) ?? (item.kind === "video" ? "mp4" : "jpg"));
    const path = `${momentId}/${crypto.randomUUID()}.${ext}`;
    const supabase = await getBrowserClient();
    const setProgress = (p: number) => setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, progress: p } : i)));
    if (item.kind === "video") {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");
      const { createResumableUpload } = await import("@/features/daily-reports/resumable-upload");
      await new Promise<void>((resolve, reject) => {
        const tus = createResumableUpload({
          bucket: MOMENTS_BUCKET,
          blob,
          path,
          contentType: blob.type || "video/mp4",
          accessToken: data.session!.access_token,
          onProgress: setProgress,
          onSuccess: () => resolve(),
          onError: (message) => reject(new Error(message)),
        });
        tus.start();
      });
    } else {
      const { error: upError } = await supabase.storage.from(MOMENTS_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (upError) throw new Error("Không tải được ảnh lên. Kiểm tra mạng rồi thử lại.");
      setProgress(100);
    }
    return path;
  }

  async function post() {
    setError(null);
    if (items.length === 0) return setError("Chọn ít nhất 1 ảnh / video.");
    if (visibility === "tagged" && !items.some((i) => i.tags.size)) return setError("Bài “Nhóm nhỏ” cần gắn thẻ ít nhất 1 bé.");
    setBusy(true);
    let momentId: string | null = null;
    try {
      setStatus("Đang tạo bài…");
      const draft = await createMomentDraft({ classKey, category, visibility, caption });
      if (!draft.ok) throw new Error(draft.error);
      momentId = draft.data.id;
      const uploaded: { path: string; kind: "image" | "video"; studentIds: string[] }[] = [];
      for (const [i, item] of items.entries()) {
        setStatus(`Đang tải ${i + 1}/${items.length}…`);
        uploaded.push({ path: await uploadOne(momentId, item), kind: item.kind, studentIds: [...item.tags] });
      }
      setStatus("Đang đăng…");
      const res = await publishMoment({ momentId, media: uploaded });
      if (!res.ok) throw new Error(res.error);
      items.forEach((i) => URL.revokeObjectURL(i.preview));
      setItems([]);
      setCaption("");
      setActive(null);
      setStatus(null);
      router.refresh();
    } catch (err) {
      reportError(err, { category: "upload", context: { where: "moments.publish", files: items.length } });
      if (momentId) await deleteMoment(momentId); // dọn bài nháp + tệp đã tải
      setError(err instanceof Error ? err.message : "Không đăng được bài. Vui lòng thử lại.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const activeItem = items.find((i) => i.key === active) ?? null;

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="font-bold">📸 Đăng khoảnh khắc lớp {className}</h2>
      <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} rows={2} placeholder="Hôm nay lớp mình…" className="rounded-xl text-base md:text-sm" />

      <div className="flex flex-wrap gap-1.5">
        {MOMENT_CATEGORY_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={category === k}
            onClick={() => setCategory(k)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", category === k ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted")}
          >
            {MOMENT_CATEGORIES[k].emoji} {MOMENT_CATEGORIES[k].label}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Ai xem được" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(Object.keys(MOMENT_VISIBILITY) as MomentVisibility[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={visibility === v}
            onClick={() => setVisibility(v)}
            className={cn("rounded-lg px-2 py-1.5 text-left text-xs transition-colors", visibility === v ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            <span className="flex items-center gap-1 text-sm font-semibold">
              {v === "class" ? <Users className="size-4" /> : <Tags className="size-4" />} {MOMENT_VISIBILITY[v].label}
            </span>
            <span className="block">{MOMENT_VISIBILITY[v].hint}</span>
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {items.map((i) => (
            <li key={i.key} className="relative">
              <button
                type="button"
                onClick={() => setActive(i.key)}
                className={cn("relative block aspect-square w-full overflow-hidden rounded-lg bg-muted ring-2", active === i.key ? "ring-primary" : "ring-transparent")}
                aria-label="Chọn để gắn thẻ"
              >
                {i.kind === "video" ? (
                  <>
                    <video src={`${i.preview}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
                    <Play className="absolute bottom-1 left-1 size-4 fill-white text-white" />
                  </>
                ) : (
                  <MediaImage src={i.preview} alt="" fill sizes="96px" className="object-cover" />
                )}
                {i.tags.size > 0 && <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-bold text-white">🏷 {i.tags.size}</span>}
                {busy && i.progress > 0 && i.progress < 100 && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
                    <span className="block h-full bg-primary" style={{ width: `${i.progress}%` }} />
                  </span>
                )}
              </button>
              {!busy && (
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(i.preview);
                    setItems((prev) => prev.filter((x) => x.key !== i.key));
                  }}
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-slate-900 text-white"
                  aria-label="Bỏ tệp"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && students.length > 0 && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            🏷 Gắn thẻ bé trong {activeItem ? `${activeItem.kind === "video" ? "video" : "ảnh"} đang chọn` : "ảnh"} — phụ huynh lọc nhanh “Ảnh có bé nhà mình”
          </p>
          <div className="flex flex-wrap gap-1.5">
            {students.map((s) => {
              const on = activeItem?.tags.has(s.id) ?? false;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!activeItem || busy}
                  onClick={() => activeItem && toggleTag(activeItem.key, s.id)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", on ? "bg-pink-500 text-white ring-pink-500" : "bg-card ring-border hover:bg-muted")}
                  title={s.name}
                >
                  {on && <Check className="size-3" />} {givenName(s.name)}
                </button>
              );
            })}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-primary">Gắn thẻ 1 bé cho tất cả ảnh</summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {students.map((s) => (
                <button key={s.id} type="button" disabled={busy} onClick={() => tagAll(s.id)} className="rounded-full bg-card px-2.5 py-1 font-semibold ring-1 ring-border hover:bg-muted">
                  {givenName(s.name)}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => fileInput.current?.click()} disabled={busy || items.length >= MAX_MOMENT_MEDIA}>
          <ImagePlus /> Ảnh / video
        </Button>
        <Button type="button" className="h-11 flex-1 rounded-xl" onClick={() => void post()} disabled={busy || items.length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} {status ?? `Đăng${items.length ? ` ${items.length} ảnh/video` : ""}`}
        </Button>
      </div>
    </section>
  );
}
