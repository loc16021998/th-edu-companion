import { Award, CalendarHeart, Star } from "lucide-react";
import { dayMonth, endOfMonth, startOfMonth, weekdayShort } from "@/lib/date";
import { cn, givenName } from "@/lib/utils";
import { EmptyState, Section } from "@/features/parent/components/section";
import { monthTitle } from "@/features/progress/components/progress-report";
import { StarLeaderboard } from "@/features/homework/components/star-leaderboard";
import type { ChildAchievements } from "../queries";
import { collectBadges } from "../milestones";
import { BadgeChip, BadgeMedal } from "./badge-medal";
import { MilestoneProgress } from "./milestone-progress";
import { AchievementCelebration } from "./achievement-celebration";

/** Nội dung Góc Thành tích của 1 bé (trang phụ huynh) — tách khỏi trang để dữ liệu nạp ở page.tsx. */
export function ChildAchievementsView({
  data,
  child,
  month,
  today,
  monthNav,
}: {
  data: ChildAchievements;
  child: { id: string; full_name: string; class_name: string };
  month: string;
  today: string;
  /** Nút chuyển tháng */
  monthNav: React.ReactNode;
}) {
  const name = givenName(child.full_name);
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold">Góc Thành tích của bé {name}</h1>
        <p className="text-sm text-muted-foreground">Sao & huy hiệu cô tặng bé sau mỗi buổi học — cùng con xem và khen bé nhé!</p>
      </div>
      {monthNav}
    </div>
  );

  if (!data.available) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState emoji="🏅" title="Góc Thành tích đang được trung tâm cài đặt" description="Sao và huy hiệu của bé sẽ xuất hiện tại đây." />
      </div>
    );
  }

  const byId = new Map(data.badges.map((b) => [b.id, b]));
  const collected = collectBadges(data.badgeAwards);
  // Bộ sưu tập: huy hiệu đang dùng + huy hiệu đã ẩn nhưng bé có trong tháng
  const shelf = data.badges.filter((b) => b.active || collected.has(b.id));
  const earnedCount = data.badgeAwards.length;

  // Nhật ký theo ngày: sao + huy hiệu + lời cô
  const days = new Map<string, { stars: number | null; note: string | null; badgeIds: string[]; badgeNotes: string[] }>();
  const dayOf = (d: string) => days.get(d) ?? days.set(d, { stars: null, note: null, badgeIds: [], badgeNotes: [] }).get(d)!;
  for (const s of data.starDays) Object.assign(dayOf(s.date), { stars: s.stars, note: s.note });
  for (const b of data.badgeAwards) {
    const d = dayOf(b.date);
    d.badgeIds.push(b.badgeId);
    if (b.note) d.badgeNotes.push(b.note);
  }
  const timeline = [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  const isCurrentMonth = month === startOfMonth(today);

  return (
    <div className="space-y-5">
      <AchievementCelebration
        studentId={child.id}
        childName={name}
        badges={data.badges}
        recent={data.recentBadges}
        total={data.totals.total}
        milestones={data.milestones}
      />
      {header}

      {/* Sao tích luỹ & phần quà */}
      <section aria-label="Sao tích luỹ & phần quà" className="rounded-3xl bg-gradient-to-br from-amber-50 via-amber-100 to-orange-100 p-4 ring-1 ring-amber-200 sm:p-5">
        <MilestoneProgress total={data.totals.total} milestones={data.milestones} redeemed={data.redeemed} childName={name} />
        <p className="mt-3 text-xs text-amber-900/70">
          Gồm {data.totals.session} sao buổi học + {data.totals.homework} sao bài tập về nhà. Đủ sao → cô trao quà cho bé ở lớp.
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: `Sao ${monthTitle(month)}`, value: data.monthStars, icon: "⭐" },
          { label: "Huy hiệu", value: earnedCount, icon: "🏅" },
          { label: "Buổi được tặng sao", value: data.starDays.length, icon: "📅" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border">
            <p className="text-2xl font-extrabold tabular-nums">
              <span aria-hidden className="mr-1 text-lg">
                {s.icon}
              </span>
              {s.value}
            </p>
            <p className="text-xs font-medium leading-tight text-muted-foreground first-letter:uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      <Section title={`Bộ sưu tập huy hiệu ${monthTitle(month)}`} icon={Award} iconClassName="bg-amber-100 text-amber-700" aside={`${collected.size}/${shelf.length}`}>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {shelf.map((b) => {
            const got = collected.get(b.id);
            return (
              <li
                key={b.id}
                className={cn("relative flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center ring-1", got ? "bg-card shadow-sm ring-amber-200" : "bg-muted/40 ring-border")}
              >
                <BadgeMedal badge={b} earned={!!got} />
                {got && got.count > 1 && (
                  <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-1.5 text-xs font-extrabold text-white tabular-nums" aria-label={`Nhận ${got.count} lần`}>
                    ×{got.count}
                  </span>
                )}
                <span className={cn("text-xs font-bold leading-tight", !got && "text-muted-foreground")}>{b.name}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{got ? `Nhận ${dayMonth(got.lastDate)}` : isCurrentMonth ? "Cố lên nào!" : "Chưa có"}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <StarLeaderboard
        rows={data.leaderboard}
        from={month}
        to={isCurrentMonth ? today : endOfMonth(month)}
        title={`Bảng vàng lớp ${child.class_name} · ${monthTitle(month)}`}
        emptyText={`Chưa có bạn nào nhận sao ${monthTitle(month)}. Bé ${name} cố gắng để là ngôi sao đầu tiên nhé! ⭐`}
        limit={10}
      />

      <Section title="Nhật ký thành tích" icon={CalendarHeart} iconClassName="bg-rose-100 text-rose-600">
        {timeline.length === 0 ? (
          <EmptyState emoji="🌱" title={`Chưa có sao hay huy hiệu ${monthTitle(month)}`} description="Sau mỗi buổi học, cô sẽ tặng sao và huy hiệu khi bé cố gắng." />
        ) : (
          <ol className="space-y-2">
            {timeline.map(([date, d]) => (
              <li key={date} className="flex gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-xs font-semibold text-muted-foreground">{weekdayShort(date)}</p>
                  <p className="text-sm font-extrabold">{dayMonth(date)}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {d.stars !== null && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="inline-flex" role="img" aria-label={`${d.stars} sao`}>
                        {Array.from({ length: 3 }, (_, i) => (
                          <Star key={i} className={cn("size-4", i < d.stars! ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                        ))}
                      </span>
                      {d.stars} sao buổi học
                    </p>
                  )}
                  {d.badgeIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.badgeIds.map((id, i) => {
                        const b = byId.get(id);
                        return b ? <BadgeChip key={`${id}-${i}`} badge={b} /> : null;
                      })}
                    </div>
                  )}
                  {[d.note, ...d.badgeNotes].filter(Boolean).map((n, i) => (
                    <p key={i} className="break-words text-sm text-muted-foreground">
                      “{n}”
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
