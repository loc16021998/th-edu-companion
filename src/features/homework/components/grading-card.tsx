"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Heart, Loader2, MessageSquareText, Mic, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { cn } from "@/lib/utils";
import { MediaGallery } from "@/features/parent/components/media-gallery";
import { gradeSubmission } from "../actions";
import type { GradingItem } from "../queries";
import { StarCount } from "./star-leaderboard";
import { VoiceRecorder } from "./voice-recorder";
import { toast } from "@/components/ui/toast";
import { playAnimation } from "@/lib/motion";

const STAR_HINT = ["", "Cố gắng tốt", "Làm tốt lắm", "Xuất sắc!"];
const QUICK_COMMENTS = ["Con làm rất tốt, cô khen! 👏", "Chữ con đẹp hơn rồi đó!", "Con đọc to, rõ ràng lắm!", "Cố gắng thêm chút nữa nhé con!"];

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function GradingCard({ item }: { item: GradingItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(item.status === "submitted");
  const [hearted, setHearted] = useState(item.hearted);
  const [stars, setStars] = useState<number>(item.stars ?? 0);
  const [comment, setComment] = useState(item.comment ?? "");
  const [voicePath, setVoicePath] = useState<string | null>(item.voicePath);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    if (stars < 1) return setError("Cô chọn số sao tặng bé (1–3 sao) nhé.");
    startTransition(async () => {
      const res = await gradeSubmission({ submissionId: item.id, hearted, stars, comment, voicePath });
      if (!res.ok) {
        toast.error("Chưa lưu được phần chấm", res.error);
        return setError(res.error);
      }
      toast.success(`Đã tặng ${stars} ⭐ cho bài làm`, "Phụ huynh nhận thông báo kèm lời phê của cô.");
      setSaved(true);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <article className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", saved && "ring-emerald-300")}>
      <header className="flex items-center gap-3">
        <StudentAvatar student={item.student} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold">{item.student.full_name}</p>
          <p className="break-words text-xs text-muted-foreground">
            {item.assignment.title} · nộp {timeLabel(item.submittedAt)}
          </p>
        </div>
        {!editing && <StarCount count={stars} className="shrink-0" />}
      </header>

      {item.media.length > 0 ? <MediaGallery items={item.media} /> : <p className="text-xs text-muted-foreground">Không tải được ảnh/video bài nộp.</p>}
      {item.parentNote && <p className="rounded-xl bg-muted/60 p-3 text-sm">Phụ huynh nhắn: “{item.parentNote}”</p>}

      {editing ? (
        <div className="space-y-3 rounded-xl bg-amber-50/60 p-3 ring-1 ring-amber-200">
          <div className="flex items-center justify-between gap-2">
            <div role="radiogroup" aria-label="Tặng sao" className="flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} sao`}
                  onClick={() => setStars(n)}
                  className="rounded-lg p-1 transition-transform active:scale-90"
                >
                  <Star className={cn("size-9", n <= stars ? "fill-amber-400 text-amber-400" : "text-amber-300")} />
                </button>
              ))}
              <span className="ml-1 text-xs font-semibold text-amber-800">{STAR_HINT[stars] ?? ""}</span>
            </div>
            <button
              type="button"
              aria-pressed={hearted}
              aria-label={hearted ? "Bỏ thả tim" : "Thả tim"}
              onClick={(e) => {
                if (!hearted) playAnimation(e.currentTarget.querySelector("svg"), "animate-heart-pop");
                setHearted((h) => !h);
              }}
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-full ring-1 transition-all active:scale-90",
                hearted ? "bg-rose-100 ring-rose-300" : "bg-white ring-border",
              )}
            >
              <Heart className={cn("size-6", hearted ? "fill-rose-500 text-rose-500" : "text-slate-400")} />
            </button>
          </div>

          <div className="space-y-1.5">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Nhận xét cho bé (không bắt buộc)"
              className="rounded-xl bg-white text-base md:text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COMMENTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setComment((c) => (c ? `${c} ${q}` : q))}
                  className="rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-border hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <VoiceRecorder
            studentId={item.student.id}
            assignmentId={item.assignment.id}
            initialPath={item.voicePath}
            initialUrl={item.voiceUrl}
            onChange={setVoicePath}
            disabled={pending}
          />

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {item.status === "graded" && (
              <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setEditing(false)} disabled={pending}>
                Huỷ
              </Button>
            )}
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />}
              {pending ? "Đang lưu..." : item.status === "graded" ? "Lưu thay đổi" : "Chấm xong & gửi phụ huynh"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 font-semibold text-emerald-900">
            {hearted && <Heart className="size-4 fill-rose-500 text-rose-500" />}
            {saved ? "Đã chấm — phụ huynh nhận thông báo" : `Đã tặng ${stars} sao`}
          </p>
          {comment && (
            <p className="flex gap-2 whitespace-pre-line text-emerald-950">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {comment}
            </p>
          )}
          {voicePath && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
              <Mic className="size-3.5" /> Có lời nhắn thoại
            </p>
          )}
          <Button type="button" variant="outline" size="sm" className="rounded-lg bg-white" onClick={() => setEditing(true)}>
            <Pencil /> Sửa chấm
          </Button>
        </div>
      )}
    </article>
  );
}
