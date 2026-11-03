"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { analyzeHomework } from "../actions";
import type { HomeworkReview } from "../review-shared";

function ScoreDots({ score }: { score: number }) {
  if (score <= 0) return <span className="text-[11px] text-muted-foreground">chưa rõ</span>;
  return (
    <span className="flex shrink-0 items-center gap-0.5" role="img" aria-label={`${score}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("size-2 rounded-full", n <= score ? (score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-amber-400" : "bg-rose-400") : "bg-muted")} />
      ))}
    </span>
  );
}

/**
 * Bản chấm NHÁP của AI cho cô (chỉ cô / quản trị thấy): đánh giá từng tiêu chí, lời phê gợi ý, số sao gợi ý.
 * "Chấp nhận nhận xét" điền sẵn lời phê + số sao vào phần chấm — cô vẫn bấm "Chấm xong & gửi phụ huynh" để duyệt.
 */
export function AiReviewPanel({ submissionId, review, onAccept }: { submissionId: string; review: HomeworkReview | null; onAccept: (comment: string, stars: number) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(async () => {
      try {
        const res = await analyzeHomework(submissionId);
        if (!res.ok) return toast.error("AI chưa phân tích được", res.error);
        router.refresh();
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại.");
      }
    });
  }

  const frame = "space-y-2 rounded-xl bg-violet-50/70 p-3 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:ring-violet-900";
  const title = (
    <p className="flex items-center gap-1.5 text-xs font-bold text-violet-800 dark:text-violet-200">
      <Sparkles className="size-3.5" aria-hidden /> AI chấm nháp
    </p>
  );

  if (pending) {
    return (
      <div className={frame} aria-live="polite">
        {title}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> AI đang xem bài làm của bé...
        </p>
      </div>
    );
  }

  // Chưa phân tích / ảnh đã đổi / lỗi → nút phân tích
  if (!review || !review.current || review.status === "failed") {
    return (
      <div className={frame}>
        {title}
        <p className="text-sm text-muted-foreground">
          {!review
            ? "Bài này chưa được AI phân tích."
            : !review.current
              ? "Phụ huynh đã nộp lại ảnh khác — cần phân tích lại."
              : "Lần phân tích trước chưa thành công."}
        </p>
        <Button type="button" size="sm" className="rounded-lg bg-violet-600 text-white hover:bg-violet-700" onClick={analyze}>
          <Sparkles className="size-4" /> AI phân tích bài
        </Button>
      </div>
    );
  }

  if (review.status === "unavailable") {
    return (
      <div className={frame}>
        {title}
        <p className="text-sm text-muted-foreground">
          {review.readable ? "Trung tâm chưa bật AI — cô chấm như bình thường nhé." : "Bài nộp chỉ có video / định dạng ảnh AI chưa đọc được — cô chấm như bình thường nhé."}
        </p>
      </div>
    );
  }

  return (
    <div className={frame}>
      <div className="flex items-center justify-between gap-2">
        {title}
        <button type="button" onClick={analyze} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:text-violet-300">
          <RefreshCw className="size-3" aria-hidden /> Phân tích lại
        </button>
      </div>
      {!review.readable && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">Ảnh chưa rõ — AI gợi ý nhờ phụ huynh chụp lại.</p>}
      {review.criteria.length > 0 && (
        <ul className="space-y-1.5">
          {review.criteria.map((c) => (
            <li key={c.label} className="text-sm">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{c.label}</span>
                <ScoreDots score={c.score} />
              </span>
              <span className="block text-xs text-muted-foreground">{c.note}</span>
            </li>
          ))}
        </ul>
      )}
      {review.draftComment && <p className="rounded-lg bg-background px-3 py-2 text-sm leading-relaxed ring-1 ring-border">“{review.draftComment}”</p>}
      <div className="flex flex-wrap items-center gap-2">
        {review.suggestedStars && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
            Gợi ý
            {Array.from({ length: review.suggestedStars }, (_, i) => (
              <Star key={i} className="size-4 fill-amber-400 text-amber-400" aria-hidden />
            ))}
            <span className="sr-only">{review.suggestedStars} sao</span>
          </span>
        )}
        {review.draftComment && review.suggestedStars && (
          <Button
            type="button"
            size="sm"
            className="ml-auto rounded-lg"
            onClick={() => {
              onAccept(review.draftComment!, review.suggestedStars!);
              toast.success("Đã điền nhận xét & số sao", "Cô xem lại rồi bấm “Chấm xong & gửi phụ huynh”.");
            }}
          >
            <Check className="size-4" /> Chấp nhận nhận xét
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Lời khen cho bé (phụ huynh đã thấy): <span className="text-foreground">{review.kidPraise}</span>
      </p>
    </div>
  );
}
