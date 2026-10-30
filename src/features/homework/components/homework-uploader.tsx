"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Play, RotateCw, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/shared/media-image";
import { getBrowserClient } from "@/lib/supabase/lazy-client";
import { cn } from "@/lib/utils";
import type { ResumableUpload } from "@/features/daily-reports/resumable-upload";
import { NETWORK_UPLOAD_ERROR, extensionFor, mediaKind, prepareImage, storageErrorMessage, validateFile } from "@/features/daily-reports/upload";
import { HOMEWORK_BUCKET, MAX_HOMEWORK_FILES, SUBMISSION_TYPES, type SubmissionType } from "../constants";
import { reportError } from "@/lib/monitoring/client";

export type UploadedFile = { path: string; previewUrl: string; kind: "image" | "video" };

type Item = {
  id: string;
  path?: string;
  previewUrl: string;
  kind: "image" | "video";
  status: "uploading" | "done" | "error";
  progress?: number;
  error?: string;
  file?: File;
  /** Tải lên trong phiên này (chưa nộp) → được xoá hẳn khỏi kho khi gỡ */
  fresh?: boolean;
};

/**
 * Tải ảnh/video bài làm từ điện thoại lên kho PRIVATE `homework` ({student}/{assignment}/{file}).
 * Ảnh tự nén; upload resumable (mạng yếu tự tải tiếp, có % tiến trình). Báo danh sách file đã tải xong qua onChange.
 */
export function HomeworkUploader({
  studentId,
  assignmentId,
  submissionType,
  initial,
  onChange,
  onBusyChange,
}: {
  studentId: string;
  assignmentId: string;
  submissionType: SubmissionType;
  initial: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>(() => initial.map((f) => ({ id: f.path, path: f.path, previewUrl: f.previewUrl, kind: f.kind, status: "done" })));
  const [notice, setNotice] = useState<string | null>(null);
  const uploads = useRef(new Map<string, ResumableUpload>());
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const busy = items.some((i) => i.status === "uploading");
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    onChange(items.filter((i) => i.status === "done" && i.path).map((i) => ({ path: i.path!, previewUrl: i.previewUrl, kind: i.kind })));
  }, [items, onChange]);
  useEffect(() => {
    const active = uploads.current;
    return () => active.forEach((u) => void u.abort(true));
  }, []);

  const patch = (id: string, changes: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  async function upload(item: Item, file: File) {
    try {
      const kind = mediaKind(file) ?? "image";
      const blob = kind === "image" ? await prepareImage(file) : file;
      const ext = blob === file ? extensionFor(file, file.name) : "jpg";
      if (!ext) throw new Error("mime type not supported");
      const path = `${studentId}/${assignmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      // Supabase + thư viện upload resumable chỉ nạp khi phụ huynh bắt đầu gửi bài (không nằm trong lần tải trang)
      const [supabase, { createResumableUpload }] = await Promise.all([getBrowserClient(), import("@/features/daily-reports/resumable-upload")]);
      const { data } = await supabase.auth.getSession();
      if (!data.session) return patch(item.id, { status: "error", error: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.", file });

      await new Promise<void>((resolve) => {
        const tus = createResumableUpload({
          bucket: HOMEWORK_BUCKET,
          blob,
          path,
          contentType: blob.type || file.type || "application/octet-stream",
          accessToken: data.session!.access_token,
          onProgress: (progress) => patch(item.id, { progress }),
          onSuccess: () => {
            uploads.current.delete(item.id);
            patch(item.id, { path, status: "done", progress: undefined, error: undefined, file: undefined, fresh: true });
            resolve();
          },
          onError: (message) => {
            reportError(new Error(`Upload thất bại: ${message}`), { category: "upload", context: { where: "homework.tus", type: file.type, size: file.size } });
            patch(item.id, { status: "error", error: message, file });
            resolve();
          },
        });
        uploads.current.set(item.id, tus);
        tus.start();
      });
    } catch (err) {
      reportError(err, { category: "upload", context: { where: "homework.prepare", type: file.type, size: file.size } });
      patch(item.id, { status: "error", error: storageErrorMessage(err instanceof Error ? err : {}), file });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const room = MAX_HOMEWORK_FILES - items.length;
    const rejected: string[] = [];
    const accepted: { item: Item; file: File }[] = [];
    for (const file of Array.from(list).slice(0, Math.max(room, 0))) {
      const problem = validateFile(file);
      const kind = mediaKind(file) ?? "image";
      if (problem) rejected.push(problem);
      else if (submissionType !== "any" && kind !== (submissionType === "photo" ? "image" : "video"))
        rejected.push(`Bài này cần nộp ${SUBMISSION_TYPES[submissionType].label.toLowerCase()} — đã bỏ qua "${file.name}".`);
      else
        accepted.push({
          file,
          item: { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, previewUrl: URL.createObjectURL(file), kind, status: "uploading" },
        });
    }
    if (list.length > room) rejected.push(`Tối đa ${MAX_HOMEWORK_FILES} ảnh/video mỗi bài.`);
    if (rejected.length) setNotice(rejected.join(" "));
    setItems((prev) => [...prev, ...accepted.map((a) => a.item)]);
    void (async () => {
      const queue = [...accepted];
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await upload(next.item, next.file);
      };
      await Promise.all([worker(), worker()]);
    })();
  }

  async function remove(item: Item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    const pending = uploads.current.get(item.id);
    if (pending) {
      uploads.current.delete(item.id);
      await pending.abort(true);
    } else if (item.fresh && item.path) {
      await (await getBrowserClient()).storage.from(HOMEWORK_BUCKET).remove([item.path]);
    }
  }

  function retry(item: Item) {
    const pending = uploads.current.get(item.id);
    patch(item.id, { status: "uploading", error: undefined });
    if (pending) pending.start();
    else if (item.file) void upload(item, item.file);
  }

  // Có mạng lại → tự tải tiếp file lỗi do mất mạng
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    const onOnline = () => itemsRef.current.filter((i) => i.status === "error" && i.error === NETWORK_UPLOAD_ERROR).forEach((i) => retryRef.current(i));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const full = items.length >= MAX_HOMEWORK_FILES;
  const resetInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border">
              {item.kind === "video" ? (
                <video src={`${item.previewUrl}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
              ) : (
                <MediaImage src={item.previewUrl} alt="" fill sizes="(min-width: 768px) 160px, 33vw" className="object-cover" />
              )}
              {item.kind === "video" && item.status === "done" && (
                <span className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play className="ml-0.5 size-3 fill-current" />
                </span>
              )}
              {item.status === "uploading" && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-xs font-semibold text-white">
                  <Loader2 className="size-6 animate-spin" />
                  {item.progress ? `${item.progress}%` : "Đang tải..."}
                </span>
              )}
              {item.status === "error" && (
                <button
                  type="button"
                  onClick={() => retry(item)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-600/80 p-1 text-center text-xs font-semibold leading-tight text-white"
                >
                  <RotateCw className="size-5" />
                  {item.error} Chạm để thử lại
                </button>
              )}
              <button
                type="button"
                onClick={() => void remove(item)}
                aria-label={item.status === "uploading" ? "Huỷ tải lên" : "Gỡ file"}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={cn("grid gap-2", submissionType === "any" ? "grid-cols-3" : "grid-cols-2")}>
        {submissionType !== "video" && (
          <Button type="button" variant="outline" className="h-11 rounded-xl px-2" disabled={full} onClick={() => photoInput.current?.click()}>
            <Camera /> Chụp ảnh
          </Button>
        )}
        {submissionType !== "photo" && (
          <Button type="button" variant="outline" className="h-11 rounded-xl px-2" disabled={full} onClick={() => videoInput.current?.click()}>
            <Video /> Quay video
          </Button>
        )}
        <Button type="button" variant="outline" className="h-11 rounded-xl px-2" disabled={full} onClick={() => galleryInput.current?.click()}>
          <ImagePlus /> Thư viện
        </Button>
      </div>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={resetInput} />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" className="hidden" onChange={resetInput} />
      <input ref={galleryInput} type="file" accept={SUBMISSION_TYPES[submissionType].accept} multiple className="hidden" onChange={resetInput} />

      <p className={cn("text-xs", notice ? "text-amber-700" : "text-muted-foreground")}>
        {notice ?? `${items.length}/${MAX_HOMEWORK_FILES} · Ảnh tự nén · Video tối đa 50MB · Mạng yếu sẽ tự tải tiếp`}
      </p>
    </div>
  );
}
