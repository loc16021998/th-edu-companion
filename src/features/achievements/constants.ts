// Hằng số dùng chung cho Góc Thành tích (server + client).

export const BADGE_TONES = ["amber", "rose", "sky", "emerald", "violet", "orange"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];

/** Huy chương: nền + viền theo màu huy hiệu (ghi đủ tên lớp để Tailwind giữ lại khi build). */
export const BADGE_TONE_CLASS: Record<BadgeTone, { medal: string; chip: string }> = {
  amber: { medal: "from-amber-200 to-amber-400 ring-amber-500/40", chip: "bg-amber-100 text-amber-900 ring-amber-300" },
  rose: { medal: "from-rose-200 to-rose-400 ring-rose-500/40", chip: "bg-rose-100 text-rose-900 ring-rose-300" },
  sky: { medal: "from-sky-200 to-sky-400 ring-sky-500/40", chip: "bg-sky-100 text-sky-900 ring-sky-300" },
  emerald: { medal: "from-emerald-200 to-emerald-400 ring-emerald-500/40", chip: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  violet: { medal: "from-violet-200 to-violet-400 ring-violet-500/40", chip: "bg-violet-100 text-violet-900 ring-violet-300" },
  orange: { medal: "from-orange-200 to-orange-400 ring-orange-500/40", chip: "bg-orange-100 text-orange-900 ring-orange-300" },
};

export const toneOf = (tone: string): BadgeTone => ((BADGE_TONES as readonly string[]).includes(tone) ? (tone as BadgeTone) : "amber");

/** Giáo viên sửa sao / huy hiệu trong 7 ngày gần nhất (khớp chính sách RLS can_award_student). */
export const AWARD_WINDOW_DAYS = 7;

export const ACHIEVEMENTS_MIGRATION_MESSAGE =
  "Database chưa có Góc Thành tích — hãy chạy file supabase/apply-achievements.sql trong Supabase SQL Editor.";

export type Badge = { id: string; code: string; name: string; emoji: string; description: string | null; tone: BadgeTone; active: boolean; sortOrder: number };
