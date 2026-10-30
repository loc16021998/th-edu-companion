import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDays, endOfMonth, startOfMonth } from "@/lib/date";
import type { Enums } from "@/types/database.types";
import type { LeaderboardRow } from "@/features/homework/queries";
import { toneOf, type Badge } from "./constants";
import type { Milestone } from "./milestones";

const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

function logUnlessMissing(scope: string, error: { code: string }) {
  if (!isMissing(error.code)) console.error(`[achievements] ${scope}:`, error);
}

/** Danh mục huy hiệu (kể cả đã ẩn — bộ sưu tập cũ vẫn hiện đúng). `available = false` khi chưa chạy apply-achievements.sql. */
export const getBadgeCatalog = cache(async (): Promise<{ available: boolean; badges: Badge[] }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("achievement_badges")
    .select("id, code, name, emoji, description, tone, active, sort_order")
    .order("sort_order")
    .order("name");
  if (error) {
    logUnlessMissing("Không tải được danh mục huy hiệu", error);
    return { available: false, badges: [] };
  }
  return {
    available: true,
    badges: data.map((b) => ({ id: b.id, code: b.code, name: b.name, emoji: b.emoji, description: b.description, tone: toneOf(b.tone), active: b.active, sortOrder: b.sort_order })),
  };
});

/** Mốc quà (mặc định chỉ mốc đang dùng), tăng dần theo số sao. */
export const getMilestones = cache(async (includeInactive = false): Promise<(Milestone & { active: boolean })[]> => {
  const supabase = await createClient();
  let query = supabase.from("reward_milestones").select("id, stars_required, title, emoji, description, active").order("stars_required");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    logUnlessMissing("Không tải được mốc quà", error);
    return [];
  }
  return data.map((m) => ({ id: m.id, starsRequired: m.stars_required, title: m.title, emoji: m.emoji, description: m.description, active: m.active }));
});

export type StarTotal = { session: number; homework: number; total: number };

/** Tổng sao tích luỹ (buổi học + bài tập) của các bé — RLS người gọi quyết định bé nào được tính. */
export async function getStarTotals(studentIds: string[]): Promise<Map<string, StarTotal>> {
  const out = new Map<string, StarTotal>();
  if (studentIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_star_totals", { p_student_ids: studentIds });
  if (error) {
    logUnlessMissing("Không tính được tổng sao", error);
    return out;
  }
  for (const r of data ?? []) out.set(r.student_id, { session: Number(r.session_stars), homework: Number(r.homework_stars), total: Number(r.total_stars) });
  return out;
}

/** Mốc quà đã trao: studentId → các milestoneId. */
export async function getRedemptions(studentIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (studentIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.from("reward_redemptions").select("student_id, milestone_id").in("student_id", studentIds);
  if (error) {
    logUnlessMissing("Không tải được quà đã trao", error);
    return out;
  }
  for (const r of data) out.set(r.student_id, (out.get(r.student_id) ?? new Set()).add(r.milestone_id));
  return out;
}

/** Bảng vàng của lớp trong khoảng ngày (sao buổi học + sao bài tập + số huy hiệu). */
export async function getClassLeaderboard(campus: Enums<"campus">, className: string, from: string, to: string): Promise<(LeaderboardRow & { badges: number })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("class_achievement_leaderboard", { p_campus: campus, p_class: className, p_from: from, p_to: to });
  if (error) {
    logUnlessMissing("Không tải được bảng vàng", error);
    return [];
  }
  return (data ?? []).map((r) => ({ studentId: r.student_id, name: r.display_name, stars: Number(r.stars), graded: 0, badges: Number(r.badges), isMine: r.is_mine }));
}

// ============================================================================= Phụ huynh

export type BadgeAward = { id: string; badgeId: string; date: string; note: string | null; createdAt: string };
export type StarAward = { date: string; stars: number; note: string | null };

export type ChildAchievements = {
  available: boolean;
  badges: Badge[];
  milestones: Milestone[];
  totals: StarTotal;
  redeemed: Set<string>;
  /** Trong tháng đang xem */
  monthStars: number;
  starDays: StarAward[];
  badgeAwards: BadgeAward[];
  /** Huy hiệu 14 ngày gần nhất (để bắn pháo giấy khi có huy hiệu mới, không phụ thuộc tháng đang xem) */
  recentBadges: BadgeAward[];
  leaderboard: (LeaderboardRow & { badges: number })[];
};

/** Mọi dữ liệu Góc Thành tích của 1 bé cho tháng `month` (yyyy-mm-01). */
export async function getChildAchievements(
  child: { id: string; campus: Enums<"campus">; class_name: string },
  month: string,
  today: string,
  opts: { leaderboard?: boolean } = {},
): Promise<ChildAchievements> {
  const from = startOfMonth(month);
  const to = endOfMonth(month) < today ? endOfMonth(month) : today;
  const supabase = await createClient();
  const [catalog, milestones, totals, redemptions, stars, badges, recent, leaderboard] = await Promise.all([
    getBadgeCatalog(),
    getMilestones(),
    getStarTotals([child.id]),
    getRedemptions([child.id]),
    supabase.from("student_star_awards").select("award_date, stars, note").eq("student_id", child.id).gte("award_date", from).lte("award_date", to).order("award_date", { ascending: false }),
    supabase
      .from("student_badge_awards")
      .select("id, badge_id, award_date, note, created_at")
      .eq("student_id", child.id)
      .gte("award_date", from)
      .lte("award_date", to)
      .order("award_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("student_badge_awards").select("id, badge_id, award_date, note, created_at").eq("student_id", child.id).gte("award_date", addDays(today, -14)).order("created_at"),
    opts.leaderboard === false ? Promise.resolve([]) : getClassLeaderboard(child.campus, child.class_name, from, to),
  ]);
  const toAward = (r: { id: string; badge_id: string; award_date: string; note: string | null; created_at: string }): BadgeAward => ({
    id: r.id,
    badgeId: r.badge_id,
    date: r.award_date,
    note: r.note,
    createdAt: r.created_at,
  });
  if (stars.error) logUnlessMissing("Không tải được sao buổi học", stars.error);
  if (badges.error) logUnlessMissing("Không tải được huy hiệu", badges.error);

  const starDays = (stars.data ?? []).map((r) => ({ date: r.award_date, stars: r.stars, note: r.note }));
  const mine = leaderboard.find((r) => r.isMine);
  return {
    available: catalog.available,
    badges: catalog.badges,
    milestones,
    totals: totals.get(child.id) ?? { session: 0, homework: 0, total: 0 },
    redeemed: redemptions.get(child.id) ?? new Set(),
    // Bảng vàng đã cộng cả sao bài tập; không tải bảng vàng → chỉ tính sao buổi học
    monthStars: mine?.stars ?? starDays.reduce((n, d) => n + d.stars, 0),
    starDays,
    badgeAwards: (badges.data ?? []).map(toAward),
    recentBadges: (recent.data ?? []).map(toAward),
    leaderboard,
  };
}

// ============================================================================= Giáo viên / quản trị

export type ClassAwardsOnDate = { stars: Map<string, number>; badges: Map<string, string[]> };

/** Sao + huy hiệu của cả lớp trong 1 ngày. */
export async function getClassAwardsOn(studentIds: string[], date: string): Promise<ClassAwardsOnDate> {
  const out: ClassAwardsOnDate = { stars: new Map(), badges: new Map() };
  if (studentIds.length === 0) return out;
  const supabase = await createClient();
  const [stars, badges] = await Promise.all([
    supabase.from("student_star_awards").select("student_id, stars").in("student_id", studentIds).eq("award_date", date),
    supabase.from("student_badge_awards").select("student_id, badge_id").in("student_id", studentIds).eq("award_date", date).order("created_at"),
  ]);
  if (stars.error) logUnlessMissing("Không tải được sao của lớp", stars.error);
  if (badges.error) logUnlessMissing("Không tải được huy hiệu của lớp", badges.error);
  for (const r of stars.data ?? []) out.stars.set(r.student_id, r.stars);
  for (const r of badges.data ?? []) out.badges.set(r.student_id, [...(out.badges.get(r.student_id) ?? []), r.badge_id]);
  return out;
}
