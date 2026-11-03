"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Volume2 } from "lucide-react";

/** Vừa nộp bài (trong vòng ~3 phút) mà chưa có lời khen → chờ AI soạn xong rồi tự hiện. */
const WAIT_MS = 3 * 60_000;
const POLL_MS = 6_000;

/** Bỏ emoji khi đọc to (giọng đọc không đọc "ngôi sao lấp lánh"…). */
const speakable = (text: string) => text.replace(/\p{Extended_Pictographic}|️|‍/gu, "").replace(/\s+/g, " ").trim();

/**
 * Lời khen cho bé ngay sau khi nộp bài — phụ huynh đọc (hoặc bấm nghe) cho con, thêm động lực học tập.
 * Lời khen do AI soạn sau khi xem bài (hoặc theo mẫu khi chưa bật AI); chỉ khen, không nhắc lỗi.
 */
export function KidPraise({ praise, submittedAt }: { praise: string | null; submittedAt: string }) {
  const router = useRouter();
  const [canSpeak, setCanSpeak] = useState(false);
  const waiting = !praise && Date.now() - new Date(submittedAt).getTime() < WAIT_MS;

  // Đang chờ AI soạn lời khen → tải lại dữ liệu trang mỗi vài giây (tối đa ~3 phút)
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(t);
  }, [waiting, router]);

  // Chỉ hiện nút nghe khi máy có giọng đọc tiếng Việt
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const check = () => setCanSpeak(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("vi")));
    check();
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, []);

  if (!praise && !waiting) return null;

  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-br from-amber-50 via-pink-50 to-violet-50 p-3 ring-1 ring-amber-200 dark:from-amber-950/40 dark:via-pink-950/30 dark:to-violet-950/30 dark:ring-amber-900" aria-live="polite">
      <p className="text-xs font-bold text-amber-800 dark:text-amber-200">🎉 Lời khen cho bé — Ba mẹ đọc cho con nghe nhé</p>
      {praise ? (
        <>
          <p className="text-base font-semibold leading-relaxed">{praise}</p>
          {canSpeak && (
            <button
              type="button"
              onClick={() => {
                const u = new SpeechSynthesisUtterance(speakable(praise));
                u.lang = "vi-VN";
                u.rate = 0.95;
                u.pitch = 1.15;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(u);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 active:scale-95 dark:bg-background"
            >
              <Volume2 className="size-4" /> Đọc cho bé nghe
            </button>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cô AI đang xem bài và chuẩn bị lời khen cho bé...
        </p>
      )}
    </div>
  );
}
