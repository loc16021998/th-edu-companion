import { CalendarClock, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayMonth, weekdayLong } from "@/lib/date";
import { SCHEDULE_LABEL, SESSION_LABEL, SESSION_PHASE_LABEL, sessionPhase } from "@/lib/schedule";

const PHASE_STYLE = {
  off: "bg-slate-100 text-slate-700 ring-slate-200",
  upcoming: "bg-sky-50 text-sky-800 ring-sky-100",
  in_progress: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  finished: "bg-violet-50 text-violet-800 ring-violet-100",
} as const;

/** Thẻ "Buổi học hôm nay": thứ/ngày, giờ học 18:00 – 19:30 và trạng thái (sắp học / đang học / đã xong / nghỉ). */
export function SessionBanner({ today, className }: { today: string; className?: string }) {
  const phase = sessionPhase(today);
  const Icon = phase === "off" ? Moon : CalendarClock;

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3 ring-1", PHASE_STYLE[phase], className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/70">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {weekdayLong(today)}, {dayMonth(today)}
          {phase !== "off" && <span className="font-semibold opacity-80"> · Buổi {SESSION_LABEL}</span>}
        </p>
        <p className="text-xs font-medium opacity-80">
          {SESSION_PHASE_LABEL[phase]}
          {phase === "off" && ` · Lịch học ${SCHEDULE_LABEL}`}
        </p>
      </div>
      {phase === "in_progress" && (
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
      )}
    </div>
  );
}
