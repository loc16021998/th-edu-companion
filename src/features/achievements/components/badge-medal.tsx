import { cn } from "@/lib/utils";
import { BADGE_TONE_CLASS, type Badge } from "../constants";

/** Huy chương tròn của 1 huy hiệu. `earned = false` → xám, mờ (chưa đạt trong bộ sưu tập). */
export function BadgeMedal({ badge, earned = true, size = "md", className }: { badge: Pick<Badge, "emoji" | "tone" | "name">; earned?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const tone = BADGE_TONE_CLASS[badge.tone];
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-2",
        size === "sm" ? "size-8 text-base" : size === "lg" ? "size-24 text-5xl ring-4" : "size-14 text-2xl",
        earned ? tone.medal : "from-slate-100 to-slate-200 ring-slate-300 grayscale",
        className,
      )}
    >
      <span className={cn(!earned && "opacity-40")}>{badge.emoji}</span>
    </span>
  );
}

/** Chip nhỏ: emoji + tên huy hiệu. */
export function BadgeChip({ badge, className, children }: { badge: Pick<Badge, "emoji" | "tone" | "name">; className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", BADGE_TONE_CLASS[badge.tone].chip, className)}>
      <span aria-hidden>{badge.emoji}</span>
      <span className="break-words">{badge.name}</span>
      {children}
    </span>
  );
}
