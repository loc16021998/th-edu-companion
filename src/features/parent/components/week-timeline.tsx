import { Camera, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { eachDay, weekdayShort } from "@/lib/date";
import type { Tables } from "@/types/database.types";
import type { SubjectsSummary } from "@/features/daily-reports/schema";
import { ATTENDANCE_STYLE, MOOD_STYLE } from "@/config/ui-styles";
import { SubjectList } from "./subject-list";

type ReportSummary = Pick<Tables<"daily_reports">, "id" | "date" | "mood" | "teacher_note" | "media_urls"> & {
  subjects_summary: SubjectsSummary;
};

export function WeekTimeline({
  from,
  to,
  today,
  attendanceByDate,
  reportByDate,
}: {
  from: string;
  to: string;
  today: string;
  attendanceByDate: Map<string, Tables<"attendance">>;
  reportByDate: Map<string, ReportSummary>;
}) {
  return (
    <ol className="space-y-2.5">
      {eachDay(from, to).map((day) => {
        const att = attendanceByDate.get(day);
        const report = reportByDate.get(day);
        const isFuture = day > today;
        const style = ATTENDANCE_STYLE[att?.status ?? "none"];
        const StatusIcon = style.icon;
        const mood = report?.mood ? MOOD_STYLE[report.mood] : null;
        const weekday = weekdayShort(day);

        return (
          <li
            key={day}
            className={cn(
              "overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border",
              isFuture && "opacity-50",
              day === today && "ring-2 ring-primary",
            )}
          >
            <div className="flex items-center gap-3 p-3">
              <div
                className={cn(
                  "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl",
                  day === today ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <span className="text-xs font-bold uppercase leading-none">{weekday}</span>
                <span className="text-lg font-extrabold tabular-nums leading-tight">{day.slice(8)}</span>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {att ? (
                    <Badge variant="soft" className={style.badge}>
                      <StatusIcon /> {style.label}
                    </Badge>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      {isFuture ? "Chưa diễn ra" : "Không có điểm danh"}
                    </span>
                  )}
                  {report && report.media_urls.length > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Camera className="size-3.5" /> {report.media_urls.length}
                    </span>
                  )}
                </div>
                {att?.note && <p className="break-words text-xs text-muted-foreground">{att.note}</p>}
              </div>

              {mood && (
                <span className="text-3xl leading-none" role="img" aria-label={mood.label} title={mood.label}>
                  {mood.emoji}
                </span>
              )}
            </div>

            {report && (
              <details className="group border-t">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  Xem nhận xét của cô
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  <SubjectList subjects={report.subjects_summary} />
                  {report.teacher_note && (
                    <p className="whitespace-pre-line rounded-xl bg-pink-50 p-3 text-sm leading-relaxed text-slate-700 ring-1 ring-pink-100">
                      {report.teacher_note}
                    </p>
                  )}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
