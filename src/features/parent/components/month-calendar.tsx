import Link from "next/link";
import { cn } from "@/lib/utils";
import { addDays, eachDay, startOfWeek } from "@/lib/date";
import type { Enums } from "@/types/database.types";
import { ATTENDANCE_STYLE, MOOD_STYLE } from "@/config/ui-styles";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Bảng điểm danh cả tháng. Bấm vào 1 ngày → xem chi tiết tuần chứa ngày đó. */
export function MonthCalendar({
  from,
  to,
  today,
  statusByDate,
  moodByDate,
  hrefForDay,
}: {
  from: string;
  to: string;
  today: string;
  statusByDate: Map<string, Enums<"attendance_status">>;
  moodByDate: Map<string, Enums<"mood"> | null>;
  hrefForDay: (date: string) => string;
}) {
  const gridStart = startOfWeek(from);
  const gridEnd = addDays(startOfWeek(to), 6);
  const days = eachDay(gridStart, gridEnd);

  return (
    <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <span key={d} className={cn("py-1", d === "CN" && "text-rose-500")}>
            {d}
          </span>
        ))}
      </div>

      <ol className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day >= from && day <= to;
          if (!inMonth) return <li key={day} aria-hidden />;

          const status = statusByDate.get(day);
          const mood = moodByDate.get(day);
          const isFuture = day > today;
          const style = ATTENDANCE_STYLE[status ?? "none"];
          const dayNum = Number(day.slice(8));

          return (
            <li key={day}>
              <Link
                href={hrefForDay(day)}
                aria-label={`Ngày ${dayNum}: ${status ? style.label : isFuture ? "chưa diễn ra" : "không có dữ liệu"}${mood ? `, ${MOOD_STYLE[mood].label}` : ""}`}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-bold transition-transform active:scale-95",
                  status ? style.cell : isFuture ? "text-muted-foreground/50" : "bg-muted/60 text-muted-foreground",
                  day === today && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                )}
              >
                <span className="tabular-nums leading-none">{dayNum}</span>
                {mood && (
                  <span aria-hidden className="mt-0.5 text-xs leading-none">
                    {MOOD_STYLE[mood].emoji}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        {(["present", "late", "absent", "absent_with_permission"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", ATTENDANCE_STYLE[k].cell)} />
            {ATTENDANCE_STYLE[k].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted" />
          Không có dữ liệu
        </li>
      </ul>
    </div>
  );
}
