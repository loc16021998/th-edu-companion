import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import type { ChildAchievements } from "../queries";
import { milestoneProgress } from "../milestones";
import { BadgeMedal } from "./badge-medal";
import { AchievementCelebration } from "./achievement-celebration";

/** Trang Hôm nay: tóm tắt sao tích luỹ + tiến độ tới quà + huy hiệu mới nhất; huy hiệu mới → pháo giấy. */
export function AchievementSummaryCard({ data, studentId, childName, href }: { data: ChildAchievements; studentId: string; childName: string; href: string }) {
  if (!data.available) return null;
  const p = milestoneProgress(data.totals.total, data.milestones);
  const byId = new Map(data.badges.map((b) => [b.id, b]));
  // Huy hiệu gần nhất trước, mỗi loại 1 lần
  const latest = [...new Map([...data.recentBadges].reverse().map((a) => [a.badgeId, byId.get(a.badgeId)])).values()].filter((b) => !!b).slice(0, 4);

  return (
    <>
      <AchievementCelebration
        studentId={studentId}
        childName={childName}
        badges={data.badges}
        recent={data.recentBadges}
        total={data.totals.total}
        milestones={data.milestones}
        moreHref={href}
      />
      <Link
        href={href}
        className="tap block space-y-3 rounded-3xl bg-gradient-to-br from-amber-50 via-amber-100 to-orange-100 p-4 ring-1 ring-amber-200 transition-shadow hover:shadow-md"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-amber-950">
            <span aria-hidden>🏆</span> Góc Thành tích của bé {childName}
          </h2>
          <ChevronRight className="size-5 shrink-0 text-amber-700" aria-hidden />
        </div>

        <div className="flex items-center gap-3">
          <p className="flex shrink-0 items-center gap-1 text-3xl font-extrabold tabular-nums text-amber-900">
            <Star className="size-7 fill-amber-400 text-amber-400" aria-hidden />
            {data.totals.total}
            <span className="sr-only">sao tích luỹ</span>
          </p>
          <div className="min-w-0 flex-1">
            <div className="h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-amber-200" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400" style={{ width: `${Math.max(p.percent, data.totals.total > p.from ? 4 : 0)}%` }} />
            </div>
            <p className="mt-1 break-words text-xs font-semibold text-amber-900">
              {p.next ? `Còn ${p.remaining} ⭐ nữa để nhận ${p.next.emoji} ${p.next.title}` : data.milestones.length ? "Đã chinh phục mọi mốc quà! 🎉" : "Tích sao để nhận quà từ trung tâm"}
            </p>
          </div>
        </div>

        {latest.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {latest.map((b) => (
                <BadgeMedal key={b.id} badge={b} size="sm" className="ring-white" />
              ))}
            </div>
            <p className="min-w-0 text-xs font-medium text-amber-900/90">
              Huy hiệu mới: <span className="font-bold">{latest.map((b) => b.name).join(", ")}</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-amber-900/80">Xem bộ sưu tập huy hiệu & bảng vàng của lớp →</p>
        )}
      </Link>
    </>
  );
}
