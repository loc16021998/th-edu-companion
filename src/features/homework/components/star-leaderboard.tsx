import { Star, Trophy } from "lucide-react";
import { dayMonth } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "../queries";

/** Hiển thị số sao: ★★☆ (luôn kèm chữ cho trình đọc màn hình). */
export function StarCount({ count, max = 3, className }: { count: number | null; max?: number; className?: string }) {
  const n = count ?? 0;
  return (
    <span className={cn("inline-flex items-center", className)} role="img" aria-label={`${n} trên ${max} sao`}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} className={cn("size-4", i < n ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
      ))}
    </span>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Bảng xếp hạng sao của lớp — "Ngôi sao chăm chỉ" (bài tập, theo tuần) hoặc Bảng vàng thi đua (Góc Thành tích, theo tháng). */
export function StarLeaderboard({
  rows,
  from,
  to,
  className,
  limit = 10,
  highlightId,
  mineLabel = "Bé nhà mình",
  title = "Ngôi sao chăm chỉ tuần này",
  emptyText = "Tuần này chưa có bạn nào nhận sao. Hoàn thành bài tập để là ngôi sao đầu tiên nhé! ⭐",
}: {
  /** `badges`: số huy hiệu trong kỳ (Bảng vàng) */
  rows: (LeaderboardRow & { badges?: number })[];
  from: string;
  to: string;
  className?: string;
  limit?: number;
  /** Quản trị: đánh dấu học sinh đang xem (thay cho "bé nhà mình" của phụ huynh) */
  highlightId?: string;
  mineLabel?: string;
  title?: string;
  emptyText?: string;
}) {
  const ranked = rows.filter((r) => r.stars > 0 || !!r.badges).map((r) => (highlightId ? { ...r, isMine: r.studentId === highlightId } : r));
  const top = ranked.slice(0, limit);
  const mine = ranked.findIndex((r) => r.isMine);

  return (
    <section className={cn("space-y-3 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-amber-900">
          <Trophy className="size-5 text-amber-500" /> {title}
        </h2>
        <span className="text-xs font-medium text-amber-800/80">
          {dayMonth(from)} – {dayMonth(to)}
        </span>
      </div>

      {top.length === 0 ? (
        <p className="rounded-xl bg-white/70 p-4 text-center text-sm text-amber-900/80">
          {emptyText}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className={cn(
                "flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm",
                r.isMine && "ring-2 ring-amber-400",
              )}
            >
              <span className="w-6 text-center text-base font-extrabold tabular-nums text-amber-700">{MEDALS[i] ?? i + 1}</span>
              <span className="min-w-0 flex-1 break-words font-semibold">
                {r.name}
                {r.isMine && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">{mineLabel}</span>}
              </span>
              {!!r.badges && (
                <span className="shrink-0 text-xs font-bold tabular-nums text-amber-800" aria-label={`${r.badges} huy hiệu`}>
                  🏅 {r.badges}
                </span>
              )}
              <span className="flex items-center gap-1 font-bold tabular-nums text-amber-700">
                <Star className="size-4 fill-amber-400 text-amber-400" /> {r.stars}
              </span>
            </li>
          ))}
        </ol>
      )}
      {mine >= limit && (
        <p className="text-xs font-medium text-amber-900/80">
          {mineLabel} đứng thứ {mine + 1} với {ranked[mine]?.stars} sao — cố lên nào! 💪
        </p>
      )}
    </section>
  );
}
