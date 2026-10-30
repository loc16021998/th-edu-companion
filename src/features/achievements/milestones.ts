// Hàm thuần (server + client) cho Góc Thành tích: tiến độ tới mốc quà, nhóm huy hiệu theo bộ sưu tập.

export type Milestone = { id: string; starsRequired: number; title: string; emoji: string; description: string | null };

export type MilestoneProgress = {
  /** Mốc đã đạt (tăng dần) */
  reached: Milestone[];
  /** Mốc kế tiếp (null = đã đạt mọi mốc) */
  next: Milestone | null;
  /** Số sao của mốc liền trước (0 nếu chưa đạt mốc nào) — thanh tiến độ tính từ đây tới mốc kế tiếp */
  from: number;
  /** Còn thiếu bao nhiêu sao tới mốc kế tiếp */
  remaining: number;
  /** 0–100 trong đoạn hiện tại */
  percent: number;
};

export function milestoneProgress(totalStars: number, milestones: readonly Milestone[]): MilestoneProgress {
  const total = Math.max(0, Math.floor(totalStars));
  const sorted = [...milestones].sort((a, b) => a.starsRequired - b.starsRequired);
  const reached = sorted.filter((m) => m.starsRequired <= total);
  const next = sorted.find((m) => m.starsRequired > total) ?? null;
  const from = reached.at(-1)?.starsRequired ?? 0;
  if (!next) return { reached, next, from, remaining: 0, percent: 100 };
  const span = next.starsRequired - from;
  return { reached, next, from, remaining: next.starsRequired - total, percent: Math.min(100, Math.max(0, Math.round(((total - from) / span) * 100))) };
}

/** Mốc đã đủ sao nhưng cô chưa trao quà. */
export function pendingRewards(totalStars: number, milestones: readonly Milestone[], redeemed: ReadonlySet<string>): Milestone[] {
  return milestoneProgress(totalStars, milestones).reached.filter((m) => !redeemed.has(m.id));
}

export type BadgeAwardLite = { badgeId: string; date: string };

/** Số lần nhận + ngày nhận gần nhất của từng huy hiệu (bộ sưu tập tháng). */
export function collectBadges(awards: readonly BadgeAwardLite[]): Map<string, { count: number; lastDate: string }> {
  const out = new Map<string, { count: number; lastDate: string }>();
  for (const a of awards) {
    const cur = out.get(a.badgeId);
    if (!cur) out.set(a.badgeId, { count: 1, lastDate: a.date });
    else out.set(a.badgeId, { count: cur.count + 1, lastDate: a.date > cur.lastDate ? a.date : cur.lastDate });
  }
  return out;
}

/** Bấm lại đúng số sao đang chọn → bỏ sao (0); bấm số khác → đặt số đó. */
export function nextStarValue(current: number, tapped: number): number {
  return current === tapped ? 0 : Math.min(3, Math.max(1, tapped));
}
