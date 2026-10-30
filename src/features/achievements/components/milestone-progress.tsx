import { Check, Gift, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { milestoneProgress, type Milestone } from "../milestones";

/**
 * Thanh tiến độ sao tích luỹ tới phần quà kế tiếp + (tuỳ chọn) danh sách các mốc quà.
 * `redeemed`: mốc cô đã trao quà; mốc đủ sao mà chưa trao → "Chờ cô trao quà".
 */
export function MilestoneProgress({
  total,
  milestones,
  redeemed,
  childName,
  showList = true,
  className,
}: {
  total: number;
  milestones: Milestone[];
  redeemed: ReadonlySet<string>;
  childName: string;
  showList?: boolean;
  className?: string;
}) {
  const p = milestoneProgress(total, milestones);
  const label = p.next
    ? `Còn ${p.remaining} sao nữa để bé ${childName} nhận ${p.next.emoji} ${p.next.title}`
    : milestones.length
      ? `Bé ${childName} đã chinh phục mọi mốc quà — giỏi quá! 🎉`
      : "Trung tâm sẽ sớm công bố các phần quà khích lệ.";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800/80">Tổng sao tích luỹ</p>
          <p className="flex items-center gap-1.5 text-4xl font-extrabold tabular-nums text-amber-900">
            <Star className="size-8 fill-amber-400 text-amber-400" aria-hidden />
            {total}
          </p>
        </div>
        {p.next && (
          <div className="text-right">
            <p className="text-xs font-semibold text-amber-800/80">Quà tiếp theo</p>
            <p className="text-sm font-bold text-amber-900">
              <span aria-hidden>{p.next.emoji}</span> {p.next.starsRequired} ⭐
            </p>
          </div>
        )}
      </div>

      <div>
        <div
          role="progressbar"
          aria-label="Tiến độ tới phần quà kế tiếp"
          aria-valuemin={p.from}
          aria-valuemax={p.next?.starsRequired ?? total}
          aria-valuenow={total}
          aria-valuetext={label}
          className="h-4 overflow-hidden rounded-full bg-white/80 ring-1 ring-amber-200"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(p.percent, total > p.from ? 4 : 0)}%` }}
          />
        </div>
        <p className="mt-1.5 text-sm font-semibold text-amber-900">{label}</p>
      </div>

      {showList && milestones.length > 0 && (
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {milestones.map((m) => {
            const reached = total >= m.starsRequired;
            const given = redeemed.has(m.id);
            return (
              <li
                key={m.id}
                className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ring-1", reached ? "bg-white ring-amber-300" : "bg-white/50 ring-amber-100")}
              >
                <span className={cn("text-2xl", !reached && "opacity-40 grayscale")} aria-hidden>
                  {m.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-bold">{m.title}</span>
                  <span className="block text-xs text-muted-foreground">{m.starsRequired} sao</span>
                </span>
                {given ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    <Check className="size-3" strokeWidth={3} /> Đã nhận
                  </span>
                ) : reached ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    <Gift className="size-3" /> Chờ cô trao
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
