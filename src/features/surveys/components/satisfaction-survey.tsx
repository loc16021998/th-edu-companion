"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { declineSurvey, submitSurvey } from "../actions";
import { RATING_LABELS, SURVEY_COMMENT_MAX, SURVEY_SNOOZE_HOURS, SURVEY_SUBJECTS, periodLabel, type SurveySubject } from "../constants";
import type { SurveyPrompt } from "../queries";

const SHOW_DELAY_MS = 5000;
const snoozeKey = (period: string) => `th-edu:survey-snooze:${period}`;

function readSnooze(period: string): number {
  try {
    return Number(localStorage.getItem(snoozeKey(period)) || 0);
  } catch {
    return 0;
  }
}

function Stars({ value, onChange, size = "lg", label }: { value: number; onChange: (v: number) => void; size?: "lg" | "sm"; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sao — ${RATING_LABELS[n]}`}
          onClick={() => onChange(n)}
          className={cn("rounded-lg transition-transform active:scale-90", size === "lg" ? "p-1" : "p-0.5")}
        >
          <Star className={cn(size === "lg" ? "size-10" : "size-6", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
        </button>
      ))}
    </div>
  );
}

/**
 * Khảo sát hài lòng cuối tháng (popup). Server quyết định có hiện không (đúng đợt + chưa trả lời);
 * "Để sau" ghi trên máy, hỏi lại sau SURVEY_SNOOZE_HOURS; "Không hỏi tháng này" ghi vào DB.
 */
export function SatisfactionSurvey({ prompt }: { prompt: SurveyPrompt }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(0);
  const [subjects, setSubjects] = useState<Partial<Record<SurveySubject, number>>>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Không chen ngang khi đang nhắn tin
  const blocked = pathname.startsWith("/parent/chat");

  useEffect(() => {
    if (blocked || open || done) return;
    if (readSnooze(prompt.period) > Date.now()) return;
    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [blocked, open, done, prompt.period]);

  function snooze() {
    try {
      localStorage.setItem(snoozeKey(prompt.period), String(Date.now() + SURVEY_SNOOZE_HOURS * 3600_000));
    } catch {
      /* không lưu được → sẽ hỏi lại ở lần mở app sau */
    }
    setOpen(false);
  }

  function decline() {
    setOpen(false);
    setDone(true);
    void declineSurvey(prompt.period);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitSurvey({ period: prompt.period, rating, subjectRatings: subjects, comment });
      if (!res.ok) return setError(res.error);
      setDone(true);
      if (rating >= 4) setTimeout(() => setOpen(false), 2500);
    });
  }

  const names = prompt.childNames.join(", ");

  return (
    // Vuốt xuống / Esc / bấm nền = "Để sau" (đã gửi xong thì chỉ đóng)
    <Sheet open={open} onOpenChange={(o) => !o && (done ? setOpen(false) : snooze())}>
      <SheetContent hideClose className="print:hidden" onOpenAutoFocus={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>("[role=radio]")?.focus();
      }}>
        {done ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-5xl" aria-hidden>
              {rating >= 4 ? "💚" : "🙏"}
            </p>
            <SheetTitle>Cảm ơn anh/chị!</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {rating >= 4
                ? "Đánh giá của anh/chị là động lực để TH EDU tiếp tục chăm chút cho các con."
                : "Trung tâm ghi nhận và sẽ cải thiện. Anh/chị có thể chia sẻ chi tiết hơn để Ban Giám đốc xử lý ngay."}
            </p>
            <div className="flex justify-center gap-2 pt-1">
              {rating > 0 && rating < 4 && (
                <Button asChild className="rounded-xl">
                  <Link href="/parent/feedback" onClick={() => setOpen(false)}>
                    Gửi góp ý chi tiết
                  </Link>
                </Button>
              )}
              <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Khảo sát {periodLabel(prompt.period)} · 30 giây</p>
                <SheetTitle className="mt-1">
                  Anh/chị hài lòng với việc học của {names ? `bé ${names}` : "con"} tại TH EDU tháng này chứ?
                </SheetTitle>
                <SheetDescription className="sr-only">Chấm từ 1 đến 5 sao, kèm nhận xét ngắn nếu muốn.</SheetDescription>
              </div>
              <button type="button" onClick={snooze} className="-mr-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Để sau">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-1">
              <Stars value={rating} onChange={setRating} label="Mức độ hài lòng chung" />
              <p className={cn("h-5 text-sm font-semibold", rating ? "text-amber-700" : "text-muted-foreground")}>
                {rating ? RATING_LABELS[rating] : "Chạm để chấm điểm"}
              </p>
            </div>

            {rating > 0 && (
              <>
                {prompt.subjects.length > 0 && (
                  <div className="space-y-2 rounded-2xl bg-muted/50 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Từng môn (không bắt buộc)</p>
                    {prompt.subjects.map((s) => (
                      <div key={s} className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{SURVEY_SUBJECTS[s]}</span>
                        <Stars size="sm" value={subjects[s] ?? 0} onChange={(v) => setSubjects((prev) => ({ ...prev, [s]: v }))} label={`Hài lòng với môn ${SURVEY_SUBJECTS[s]}`} />
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <label htmlFor="survey-comment" className="text-xs font-semibold text-muted-foreground">
                    {rating <= 3 ? "Điều gì khiến anh/chị chưa hài lòng?" : "Điều anh/chị thích nhất / mong muốn thêm?"} (không bắt buộc)
                  </label>
                  <textarea
                    id="survey-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={SURVEY_COMMENT_MAX}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-xl border bg-background px-3 py-2 text-base md:text-sm"
                    placeholder="Vài dòng ngắn giúp trung tâm cải thiện..."
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <div className="space-y-2">
              <Button type="button" className="h-11 w-full rounded-xl text-base" disabled={!rating || pending} onClick={submit}>
                {pending && <Loader2 className="animate-spin" />} Gửi đánh giá
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={snooze} className="font-semibold text-muted-foreground hover:text-foreground">
                  Để sau
                </button>
                <button type="button" onClick={decline} className="text-muted-foreground hover:text-foreground">
                  Không hỏi lại tháng này
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
