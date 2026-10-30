import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayMonth, weekdayLong } from "@/lib/date";
import { isSchoolDay } from "@/lib/schedule";
import type { Tables } from "@/types/database.types";
import { ATTENDANCE_STYLE, MOOD_STYLE } from "@/config/ui-styles";
import { Section } from "./section";

export function TodayStatus({
  today,
  attendance,
  mood,
}: {
  today: string;
  attendance: Tables<"attendance"> | null;
  mood: Tables<"daily_reports">["mood"];
}) {
  const att = ATTENDANCE_STYLE[attendance?.status ?? "none"];
  // Chủ nhật không có buổi học → không hiển thị "Chưa điểm danh" gây lo lắng
  const offDay = !attendance && !isSchoolDay(today);
  const AttIcon = att.icon;
  const moodStyle = mood ? MOOD_STYLE[mood] : null;

  return (
    <Section
      title="Hôm nay của con"
      icon={Sparkles}
      iconClassName="bg-yellow-100 text-yellow-600"
      aside={`${weekdayLong(today)}, ${dayMonth(today)}`}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("rounded-2xl p-4 shadow-neu ring-1", att.card)}>
          <p className="text-xs font-semibold opacity-75">Điểm danh</p>
          <div className="mt-2 flex items-center gap-2">
            <AttIcon className="size-7 shrink-0" />
            <span className="text-base font-extrabold leading-tight">{offDay ? "Nghỉ học (Chủ nhật)" : att.label}</span>
          </div>
          {attendance?.note && <p className="mt-2 line-clamp-2 text-xs opacity-80">{attendance.note}</p>}
        </div>

        <div className={cn("rounded-2xl p-4 shadow-neu ring-1", moodStyle?.card ?? ATTENDANCE_STYLE.none.card)}>
          <p className="text-xs font-semibold opacity-75">Tâm trạng ở lớp</p>
          {moodStyle ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-4xl leading-none" role="img" aria-label={moodStyle.label}>
                {moodStyle.emoji}
              </span>
              <span className="text-base font-extrabold leading-tight">{moodStyle.label}</span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-3xl leading-none opacity-60" aria-hidden>
                🌤️
              </span>
              <span className="text-sm font-semibold leading-tight">Cô chưa cập nhật</span>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
