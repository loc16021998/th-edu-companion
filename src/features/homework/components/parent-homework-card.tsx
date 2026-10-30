"use client";

import { useCallback, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Heart, Loader2, MessageSquareText, Mic, Pencil, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SUBJECTS } from "@/config/constants";
import { dayMonth, weekdayShort } from "@/lib/date";
import { isSubjectKey } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { MediaGallery } from "@/features/parent/components/media-gallery";
import { submitHomework } from "../actions";
import { HOMEWORK_STATUS, SUBMISSION_TYPES } from "../constants";
import type { ParentHomeworkItem } from "../queries";
import { HomeworkUploader, type UploadedFile } from "./homework-uploader";
import { StarCount } from "./star-leaderboard";
import { toast } from "@/components/ui/toast";
import { playAnimation } from "@/lib/motion";

/** `readOnly`: quản trị xem đúng giao diện phụ huynh nhưng không nộp / sửa bài thay. */
export function ParentHomeworkCard({ item, studentId, today, readOnly = false }: { item: ParentHomeworkItem; studentId: string; today: string; readOnly?: boolean }) {
  const { assignment: a, status, submission: sub } = item;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(sub?.parent_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onBusyChange = useCallback((b: boolean) => setBusy(b), []);

  const overdue = status === "pending" && a.due_date !== null && a.due_date < today;
  const statusInfo = HOMEWORK_STATUS[status];

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitHomework({ assignmentId: a.id, studentId, mediaPaths: files.map((f) => f.path), note });
      if (!res.ok) {
        toast.error("Chưa nộp được bài", res.error);
        return setError(res.error);
      }
      toast.success("Nộp bài thành công! 🎉", "Cô sẽ chấm và tặng sao cho bé sớm nhé.");
      // Thẻ bài tập nảy lên vui nhộn (khung nộp bài đã đóng)
      playAnimation(cardRef.current, "animate-bounce-in");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <article
      ref={cardRef}
      className={cn(
        "space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border",
        status === "graded" && "ring-emerald-200",
        overdue && "ring-amber-300",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className={cn("rounded-full px-2 py-0.5 ring-1", statusInfo.badge)}>{statusInfo.label}</span>
            {isSubjectKey(a.subject) && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{SUBJECTS[a.subject]}</span>}
            <span className="text-muted-foreground">{SUBMISSION_TYPES[a.submission_type].label}</span>
          </div>
          <h3 className="font-bold leading-snug">{a.title}</h3>
          {a.due_date && (
            <p className={cn("flex items-center gap-1 text-xs", overdue ? "font-semibold text-amber-700" : "text-muted-foreground")}>
              <CalendarClock className="size-3.5" />
              Hạn nộp: {weekdayShort(a.due_date)}, {dayMonth(a.due_date)}
              {overdue && " · đã quá hạn, vẫn nộp được nhé"}
            </p>
          )}
        </div>
        {status === "graded" && <StarCount count={sub?.stars ?? 0} className="shrink-0 pt-0.5 [&_svg]:size-5" />}
      </header>

      {a.instructions && <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">{a.instructions}</p>}

      {/* Bài đã nộp */}
      {sub && !open && (
        <div className="space-y-2">
          {sub.media.length > 0 ? (
            <MediaGallery items={sub.media} />
          ) : (
            <p className="text-xs text-muted-foreground">Ảnh/video bài nộp đã hết hạn lưu trữ.</p>
          )}
          {sub.parent_note && <p className="text-sm text-muted-foreground">Lời nhắn của bố mẹ: “{sub.parent_note}”</p>}
        </div>
      )}

      {/* Cô chấm */}
      {status === "graded" && sub && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-900">
            {sub.hearted && <Heart className="size-4 fill-rose-500 text-rose-500" aria-label="Cô thả tim" />}
            Cô tặng bé {sub.stars ?? 0} sao ⭐
          </p>
          {sub.comment && (
            <p className="flex gap-2 whitespace-pre-line text-sm text-emerald-950">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {sub.comment}
            </p>
          )}
          {sub.voiceUrl && (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <Mic className="size-3.5" /> Lời nhắn thoại của cô
              </p>
              <audio controls preload="none" src={sub.voiceUrl} className="h-10 w-full" />
            </div>
          )}
        </div>
      )}

      {/* Nộp / sửa bài */}
      {status !== "graded" && !readOnly && (
        <>
          {open ? (
            <div className="space-y-3 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/15">
              <HomeworkUploader
                studentId={studentId}
                assignmentId={a.id}
                submissionType={a.submission_type}
                initial={sub?.media.map((m) => ({ path: m.path, previewUrl: m.url, kind: m.type })) ?? []}
                onChange={setFiles}
                onBusyChange={onBusyChange}
              />
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Lời nhắn cho cô (không bắt buộc)"
                className="rounded-xl text-base md:text-sm"
              />
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setOpen(false)} disabled={pending}>
                  Huỷ
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-xl"
                  onClick={(e) => {
                    playAnimation(e.currentTarget, "animate-bounce-in");
                    submit();
                  }}
                  disabled={pending || busy || files.length === 0}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />}
                  {busy ? "Đang tải file lên..." : pending ? "Đang nộp..." : sub ? "Nộp lại bài" : "Nộp bài cho cô"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant={sub ? "outline" : "default"}
              className="h-11 w-full rounded-xl"
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
            >
              {sub ? <Pencil /> : <Upload />}
              {sub ? "Sửa bài đã nộp" : "Nộp bài làm của bé"}
              <ChevronDown className="ml-auto opacity-60" />
            </Button>
          )}
        </>
      )}
    </article>
  );
}
