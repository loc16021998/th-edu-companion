import { Star } from "lucide-react";
import { SUBJECTS, type SubjectKey } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { SubjectsSummary } from "@/features/daily-reports/schema";
import { SUBJECT_STYLE } from "@/config/ui-styles";

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" role="img" aria-label={`${rating}/5 sao`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn("size-3.5", i < rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200")}
        />
      ))}
    </span>
  );
}

/** Nhận xét các môn theo thứ tự cố định trong SUBJECTS; bỏ qua môn không có dữ liệu. */
export function SubjectList({ subjects }: { subjects: SubjectsSummary }) {
  const entries = (Object.keys(SUBJECTS) as SubjectKey[]).flatMap((key) => {
    const entry = subjects[key];
    return entry && (entry.comment || entry.rating) ? [{ key, ...entry }] : [];
  });

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có nhận xét theo môn.</p>;
  }

  return (
    <ul className="divide-y">
      {entries.map(({ key, rating, comment }) => {
        const { icon: Icon, bubble } = SUBJECT_STYLE[key];
        return (
          <li key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", bubble)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="font-bold">{SUBJECTS[key]}</p>
                {rating ? <Stars rating={rating} /> : null}
              </div>
              {comment && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{comment}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
