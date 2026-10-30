"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toast góc trên màn hình (kiểu app): icon động + âm thanh nhẹ + rung (máy hỗ trợ).
 *   toast.success("Đã lưu điểm danh", "25 học sinh lúc 18:05");
 *   toast.error("Không lưu được", res.error);
 * <Toaster /> gắn 1 lần ở layout gốc. Âm thanh tắt được (setFeedbackSound) — lưu trên máy.
 */
type Tone = "success" | "error" | "info";
type ToastItem = { id: number; tone: Tone; title: string; description?: string; leaving?: boolean };

let push: ((t: Omit<ToastItem, "id">) => void) | null = null;
let nextId = 1;

const SOUND_KEY = "th-edu:feedback-sound";

export function feedbackSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFeedbackSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* không lưu được → dùng mặc định */
  }
}

// ----------------------------------------------------------------------------- Âm thanh + rung
let audio: AudioContext | null = null;

/** Âm báo tạo bằng Web Audio (không tải file): thành công = 2 nốt trong trẻo đi lên; lỗi = 2 tiếng trầm ngắn. */
function playTone(tone: Tone) {
  if (tone === "info" || !feedbackSoundEnabled()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const notes = tone === "success" ? [880, 1318.5] : [220, 196];
    const start = audio.currentTime + 0.01;
    notes.forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = tone === "success" ? "sine" : "triangle";
      osc.frequency.value = freq;
      const t = start + i * 0.11;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(tone === "success" ? 0.07 : 0.06, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch {
    /* trình duyệt chặn âm thanh → bỏ qua */
  }
}

/** Rung phản hồi (Android Chrome…; iPhone không hỗ trợ trên web → bỏ qua). */
export function haptic(kind: "tap" | "success" | "error" = "tap") {
  try {
    navigator.vibrate?.(kind === "error" ? [30, 50, 30] : kind === "success" ? [14] : [8]);
  } catch {
    /* không hỗ trợ */
  }
}

function show(tone: Tone, title: string, description?: string) {
  playTone(tone);
  if (tone !== "info") haptic(tone);
  if (push) push({ tone, title, description });
}

export const toast = {
  success: (title: string, description?: string) => show("success", title, description),
  error: (title: string, description?: string) => show("error", title, description),
  info: (title: string, description?: string) => show("info", title, description),
};

// ----------------------------------------------------------------------------- Icon động
function ToastIcon({ tone }: { tone: Tone }) {
  if (tone === "success") {
    return (
      <span className="flex size-9 shrink-0 animate-toast-icon items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" className="animate-check-draw [stroke-dasharray:24] [stroke-dashoffset:24]" />
        </svg>
      </span>
    );
  }
  if (tone === "error") {
    return (
      <span className="flex size-9 shrink-0 animate-shake items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/30">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
          <path d="M12 7v6M12 17h.01" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 animate-toast-icon items-center justify-center rounded-full bg-sky-500 text-white">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
        <path d="M12 11v6M12 7h.01" />
      </svg>
    </span>
  );
}

// ----------------------------------------------------------------------------- Toaster
const DURATION: Record<Tone, number> = { success: 3200, info: 3500, error: 5500 };
const MAX = 3;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const drag = useRef<{ id: number; startY: number; el: HTMLElement } | null>(null);

  function dismiss(id: number) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220);
  }

  useEffect(() => {
    push = (t) => {
      const id = nextId++;
      setItems((list) => [...list.slice(-(MAX - 1)), { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[t.tone]),
      );
    };
    const active = timers.current;
    return () => {
      push = null;
      active.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[95] flex flex-col items-center gap-2 px-3 print:hidden"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          // Vuốt lên để tắt
          onPointerDown={(e) => {
            drag.current = { id: t.id, startY: e.clientY, el: e.currentTarget };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== t.id) return;
            const dy = Math.min(0, e.clientY - d.startY);
            d.el.style.transform = `translateY(${dy}px)`;
            d.el.style.opacity = String(1 + dy / 120);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            if (e.clientY - d.startY < -40) dismiss(t.id);
            else {
              d.el.style.transform = "";
              d.el.style.opacity = "";
            }
          }}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm touch-none items-center gap-3 rounded-2xl bg-card/95 p-3 pr-2 shadow-xl shadow-black/10 ring-1 backdrop-blur transition-[transform,opacity] duration-200",
            t.tone === "error" ? "ring-rose-200" : t.tone === "success" ? "ring-emerald-200" : "ring-border",
            t.leaving ? "animate-toast-out" : "animate-toast-in",
          )}
        >
          <ToastIcon tone={t.tone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug">{t.title}</p>
            {t.description && <p className="text-xs leading-snug text-muted-foreground">{t.description}</p>}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Đóng thông báo">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
