"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/lazy-client";
import { HOMEWORK_BUCKET, MAX_VOICE_SECONDS } from "../constants";

/** Định dạng ghi âm trình duyệt hỗ trợ: Chrome/Android → webm/opus, Safari/iOS → mp4 (aac). */
function pickMimeType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? { mime: "", ext: "webm" };
}

type Phase = "idle" | "recording" | "uploading" | "ready" | "error";

/**
 * Lời nhắn thoại ngắn của cô (MediaRecorder, tối đa 60 giây) → tải lên kho `homework`
 * tại {student}/{assignment}/voice-….{ext}. Báo path qua onChange (null = không có/đã xoá).
 */
export function VoiceRecorder({
  studentId,
  assignmentId,
  initialUrl,
  initialPath,
  onChange,
  disabled,
}: {
  studentId: string;
  assignmentId: string;
  initialUrl: string | null;
  initialPath: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(initialPath ? "ready" : "idle");
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const freshPath = useRef<string | null>(null);

  function cleanup() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => cleanup, []);

  async function start() {
    setError(null);
    const format = pickMimeType();
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      return setError("Trình duyệt này chưa hỗ trợ ghi âm. Hãy thử Chrome hoặc Safari mới nhất.");
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setPhase("error");
      return setError("Chưa được cấp quyền micro. Hãy cho phép dùng micro trong cài đặt trình duyệt rồi thử lại.");
    }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, format.mime ? { mimeType: format.mime, audioBitsPerSecond: 48_000 } : undefined);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      cleanup();
      const type = rec.mimeType || format.mime || "audio/webm";
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      void upload(new Blob(chunks, { type: type.split(";")[0] }), ext);
    };
    rec.start(1000);
    setSeconds(0);
    setPhase("recording");
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS && rec.state === "recording") rec.stop();
    }, 250);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function upload(blob: Blob, ext: string) {
    if (blob.size < 1000) {
      setPhase("idle");
      return setError("Ghi âm quá ngắn, cô thử lại nhé.");
    }
    setPhase("uploading");
    const path = `${studentId}/${assignmentId}/voice-${Date.now()}.${ext}`;
    const supabase = await getBrowserClient();
    const { error: upErr } = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) {
      setPhase("error");
      return setError("Không tải được ghi âm lên. Kiểm tra mạng rồi thử lại.");
    }
    await discardFresh();
    freshPath.current = path;
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(blob));
    setPhase("ready");
    onChange(path);
  }

  /** Bản ghi mới (chưa lưu chấm) bị thay/xoá → dọn khỏi kho. Bản đã lưu trước đó giữ nguyên tới khi lưu chấm. */
  async function discardFresh() {
    if (!freshPath.current) return;
    const old = freshPath.current;
    freshPath.current = null;
    await (await getBrowserClient()).storage.from(HOMEWORK_BUCKET).remove([old]);
  }

  async function remove() {
    await discardFresh();
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    setUrl(null);
    setPhase("idle");
    onChange(null);
  }

  const left = MAX_VOICE_SECONDS - seconds;

  return (
    <div className="space-y-2">
      {phase === "recording" ? (
        <div className="flex items-center gap-3 rounded-xl bg-rose-50 p-2 pl-3 ring-1 ring-rose-200">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-rose-500" />
          </span>
          <span className="flex-1 text-sm font-semibold tabular-nums text-rose-800">
            Đang ghi âm 0:{String(seconds).padStart(2, "0")} <span className="font-normal text-rose-700/80">· còn {left}s</span>
          </span>
          <Button type="button" size="sm" variant="destructive" className="h-9 rounded-lg" onClick={stop}>
            <Square className="fill-current" /> Dừng
          </Button>
        </div>
      ) : phase === "uploading" ? (
        <p className="flex h-11 items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Đang lưu ghi âm...
        </p>
      ) : phase === "ready" && url ? (
        <div className="flex items-center gap-2">
          <audio controls src={url} preload="metadata" className="h-10 min-w-0 flex-1" />
          <Button type="button" size="icon" variant="ghost" className="size-10 shrink-0" onClick={() => void remove()} disabled={disabled} aria-label="Xoá ghi âm">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={() => void start()} disabled={disabled}>
          <Mic /> Ghi lời nhắn thoại (tối đa {MAX_VOICE_SECONDS} giây)
        </Button>
      )}
      {phase === "ready" && !url && (
        <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
          Ghi âm cũ không phát được — xoá và ghi lại
        </Button>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
