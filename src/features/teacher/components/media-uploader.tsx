"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CircleAlert, ImagePlus, Loader2, Play, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/shared/media-image";
import { cn } from "@/lib/utils";
import { MEDIA_BUCKET } from "@/config/constants";
import { getBrowserClient } from "@/lib/supabase/lazy-client";
import { MAX_MEDIA } from "@/features/daily-reports/schema";
import {
  NETWORK_UPLOAD_ERROR,
  buildMediaPath,
  extensionFor,
  mediaKind,
  prepareImage,
  storageErrorMessage,
  validateFile,
} from "@/features/daily-reports/upload";
import type { ResumableUpload } from "@/features/daily-reports/resumable-upload";
import { reportError } from "@/lib/monitoring/client";

type Item = {
  id: string;
  path?: string; // có khi đã nằm trên Storage
  previewUrl: string;
  kind: "image" | "video";
  status: "uploading" | "done" | "error";
  /** 0–100, chỉ khi đang tải */
  progress?: number;
  error?: string;
  file?: File; // giữ lại để thử lại khi lỗi
  /** Tải lên trong phiên này và CHƯA lưu sổ → được phép xoá hẳn khỏi Storage */
  ephemeral?: boolean;
};

/**
 * Tải ảnh/video thẳng từ trình duyệt lên Supabase Storage (bucket private `student-activities`)
 * bằng session của giáo viên → storage RLS kiểm tra quyền theo thư mục {student_id}.
 * Giá trị trả ra (onChange) là mảng đường dẫn đã tải xong, gắn vào `media_urls`.
 */
export function MediaUploader({
  studentId,
  date,
  value,
  onChange,
  onBusyChange,
  existing,
  savedVersion,
}: {
  studentId: string;
  date: string;
  value: string[];
  onChange: (paths: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  /** Media đã lưu trước đó: path → URL xem trước (signed) */
  existing: { path: string; url: string; type: "image" | "video" }[];
  /** Tăng sau mỗi lần lưu sổ thành công → file vừa tải trở thành "đã lưu" */
  savedVersion: number;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    existing
      .filter((m) => value.includes(m.path))
      .map((m) => ({ id: m.path, path: m.path, previewUrl: m.url, kind: m.type, status: "done" })),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const busy = items.some((i) => i.status === "uploading");
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Đồng bộ danh sách path đã tải xong ra form
  useEffect(() => {
    const paths = items.filter((i) => i.status === "done" && i.path).map((i) => i.path!);
    if (paths.length !== value.length || paths.some((p, idx) => p !== value[idx])) onChange(paths);
  }, [items, value, onChange]);

  useEffect(() => {
    if (savedVersion > 0) setItems((prev) => prev.map((i) => ({ ...i, ephemeral: false })));
  }, [savedVersion]);

  // Giải phóng object URL khi unmount
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => itemsRef.current.forEach((i) => i.previewUrl.startsWith("blob:") && URL.revokeObjectURL(i.previewUrl)),
    [],
  );

  // Upload resumable đang chạy/tạm dừng theo id — thử lại sẽ NỐI TIẾP phần đã tải thay vì tải lại từ đầu
  const uploads = useRef(new Map<string, ResumableUpload>());
  const cancelled = useRef(new Set<string>());
  useEffect(() => {
    const active = uploads.current;
    return () => active.forEach((u) => void u.abort(true));
  }, []);

  function patch(id: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }

  async function upload(item: Item, file: File) {
    let blob: Blob;
    let path: string;
    let accessToken: string;
    let createResumableUpload: typeof import("@/features/daily-reports/resumable-upload").createResumableUpload;
    try {
      const kind = mediaKind(file) ?? "image";
      blob = kind === "image" ? await prepareImage(file) : file;
      const ext = blob === file ? extensionFor(file, file.name) : "jpg";
      if (!ext) throw new Error("mime type not supported");
      path = buildMediaPath(studentId, date, ext);
      // Supabase + thư viện upload resumable chỉ nạp khi bắt đầu tải lên (không nằm trong lần tải trang)
      const [supabase, resumable] = await Promise.all([getBrowserClient(), import("@/features/daily-reports/resumable-upload")]);
      createResumableUpload = resumable.createResumableUpload;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        patch(item.id, { status: "error", error: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.", file });
        return;
      }
      accessToken = data.session.access_token;
    } catch (err) {
      reportError(err, { category: "upload", context: { where: "daily-report.prepare", type: file.type, size: file.size } });
      patch(item.id, { status: "error", error: storageErrorMessage(err instanceof Error ? err : {}), file });
      return;
    }
    if (cancelled.current.has(item.id)) return; // GV đã huỷ trong lúc nén ảnh

    await new Promise<void>((resolve) => {
      const tus = createResumableUpload({
        blob,
        path,
        contentType: blob.type || file.type || "application/octet-stream",
        accessToken,
        onProgress: (progress) => patch(item.id, { progress }),
        onSuccess: () => {
          uploads.current.delete(item.id);
          patch(item.id, { path, status: "done", progress: undefined, error: undefined, file: undefined, ephemeral: true });
          resolve();
        },
        onError: (message) => {
          reportError(new Error(`Upload thất bại: ${message}`), { category: "upload", context: { where: "daily-report.tus", type: file.type, size: file.size } });
          patch(item.id, { status: "error", error: message, file });
          resolve();
        },
      });
      uploads.current.set(item.id, tus);
      tus.start();
    });
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const room = MAX_MEDIA - items.length;
    const files = Array.from(list);
    if (files.length > room) setNotice(`Tối đa ${MAX_MEDIA} ảnh/video — đã bỏ qua ${files.length - Math.max(room, 0)} file.`);

    const accepted: { item: Item; file: File }[] = [];
    const rejected: string[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      const problem = validateFile(file);
      if (problem) {
        rejected.push(problem);
        continue;
      }
      accepted.push({
        file,
        item: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          previewUrl: URL.createObjectURL(file),
          kind: mediaKind(file) ?? "image",
          status: "uploading",
        },
      });
    }
    if (rejected.length) setNotice(rejected.join(" "));
    setItems((prev) => [...prev, ...accepted.map((a) => a.item)]);
    // Tải tối đa 2 file cùng lúc — nhẹ cho mạng di động
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
    cancelled.current.add(item.id);
    if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    // Đang tải dở → huỷ và xoá phần đã tải trên server
    const pending = uploads.current.get(item.id);
    if (pending) {
      uploads.current.delete(item.id);
      await pending.abort(true);
      return;
    }
    // Chỉ xoá hẳn file vừa tải mà chưa lưu sổ; file đã lưu chỉ gỡ khỏi sổ (tránh ảnh hỏng nếu GV không bấm Lưu)
    if (item.ephemeral && item.path) {
      const { error } = await (await getBrowserClient()).storage.from(MEDIA_BUCKET).remove([item.path]);
      if (error) console.warn("[upload] Không xoá được file tạm:", error);
    }
  }

  function retry(item: Item) {
    const pending = uploads.current.get(item.id);
    if (!pending && !item.file) return;
    patch(item.id, { status: "uploading", error: undefined });
    if (pending) pending.start(); // nối tiếp từ byte đã tải
    else if (item.file) void upload(item, item.file);
  }

  // Có mạng trở lại → tự tải tiếp các file bị lỗi do mất mạng
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    const onOnline = () =>
      itemsRef.current.filter((i) => i.status === "error" && i.error === NETWORK_UPLOAD_ERROR).forEach((i) => retryRef.current(i));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const full = items.length >= MAX_MEDIA;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                  <span
                    className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/30"
                    role="progressbar"
                    aria-label="Tiến trình tải lên"
                    aria-valuenow={item.progress ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span className="block h-full rounded-full bg-white transition-[width]" style={{ width: `${item.progress ?? 0}%` }} />
                  </span>
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
                aria-label={item.status === "uploading" ? "Huỷ tải lên" : "Gỡ ảnh"}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={full} onClick={() => cameraInput.current?.click()}>
          <Camera /> Chụp ảnh
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={full} onClick={() => galleryInput.current?.click()}>
          <ImagePlus /> Thư viện
        </Button>
      </div>
      {/* input ẩn: reset value để chọn lại cùng file vẫn kích hoạt onChange */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className={cn("flex items-start gap-1.5 text-xs", notice ? "text-amber-700" : "text-muted-foreground")}>
        {notice && <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
        {notice ?? `${items.length}/${MAX_MEDIA} · Ảnh tự nén trước khi tải · Video tối đa 50MB`}
      </p>
    </div>
  );
}
