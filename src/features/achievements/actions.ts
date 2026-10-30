"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { requireRole } from "@/features/auth/queries";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { ACHIEVEMENTS_MIGRATION_MESSAGE, AWARD_WINDOW_DAYS } from "./constants";
import { badgeSchema, classStarsSchema, milestoneSchema, rewardSchema, setStarsSchema, toggleBadgeSchema, type BadgeInput, type MilestoneInput } from "./schema";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const isMissing = (code: string) => ["PGRST205", "PGRST202", "42P01", "42703"].includes(code);

function fail(scope: string, error: { code: string; message: string }) {
  console.error(`[achievements] ${scope}:`, error);
  if (isMissing(error.code)) return ACHIEVEMENTS_MIGRATION_MESSAGE;
  // RLS: không phụ trách bé / quá hạn sửa
  if (error.code === "42501") return `Chỉ tặng được cho bé lớp mình phụ trách, trong ${AWARD_WINDOW_DAYS} ngày gần nhất.`;
  return dbErrorMessage(error);
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
}

function revalidateAwards() {
  revalidatePath("/teacher/achievements");
  revalidatePath("/admin/achievements");
  revalidatePath("/parent", "layout");
}

// ============================================================================= Giáo viên / quản trị: tặng sao & huy hiệu

/** Đặt số sao (1–3) của bé cho buổi học ngày `date`; 0 = bỏ sao. */
export async function setSessionStars(input: unknown): Promise<ActionResult<null>> {
  const parsed = setStarsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("teacher", "admin");
  const { studentId, date, stars } = parsed.data;
  try {
    const supabase = await createClient();
    const { error } =
      stars === 0
        ? await supabase.from("student_star_awards").delete().eq("student_id", studentId).eq("award_date", date)
        : await supabase.from("student_star_awards").upsert({ student_id: studentId, award_date: date, stars }, { onConflict: "student_id,award_date" });
    if (error) return { ok: false, error: fail("setSessionStars", error) };
  } catch (err) {
    console.error("[achievements] setSessionStars lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  if (stars > 0) schedulePushDelivery();
  revalidateAwards();
  return { ok: true, data: null };
}

/** Trao / gỡ 1 huy hiệu của bé cho ngày `date`. */
export async function toggleBadge(input: unknown): Promise<ActionResult<null>> {
  const parsed = toggleBadgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("teacher", "admin");
  const { studentId, badgeId, date, on } = parsed.data;
  try {
    const supabase = await createClient();
    if (on) {
      const { error } = await supabase.from("student_badge_awards").insert({ student_id: studentId, badge_id: badgeId, award_date: date });
      // Đã trao rồi (bấm 2 lần / 2 máy) → coi như thành công
      if (error && error.code !== "23505") return { ok: false, error: fail("toggleBadge.insert", error) };
    } else {
      const { error } = await supabase.from("student_badge_awards").delete().eq("student_id", studentId).eq("badge_id", badgeId).eq("award_date", date);
      if (error) return { ok: false, error: fail("toggleBadge.delete", error) };
    }
  } catch (err) {
    console.error("[achievements] toggleBadge lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  if (on) schedulePushDelivery();
  revalidateAwards();
  return { ok: true, data: null };
}

/** Tặng nhanh `stars` sao cho các bé CHƯA có sao buổi đó (không ghi đè số sao cô đã chấm riêng). */
export async function awardClassStars(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = classStarsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("teacher", "admin");
  const { studentIds, date, stars } = parsed.data;
  let count = 0;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_star_awards")
      .upsert(
        [...new Set(studentIds)].map((id) => ({ student_id: id, award_date: date, stars })),
        { onConflict: "student_id,award_date", ignoreDuplicates: true },
      )
      .select("id");
    if (error) return { ok: false, error: fail("awardClassStars", error) };
    count = data.length;
  } catch (err) {
    console.error("[achievements] awardClassStars lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  if (count > 0) schedulePushDelivery();
  revalidateAwards();
  return { ok: true, data: { count } };
}

/** Đánh dấu đã trao / chưa trao quà của 1 mốc cho bé. */
export async function setRewardGiven(input: unknown): Promise<ActionResult<null>> {
  const parsed = rewardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const profile = await requireRole("teacher", "admin");
  const { studentId, milestoneId, given } = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = given
      ? await supabase.from("reward_redemptions").insert({ student_id: studentId, milestone_id: milestoneId, given_by: profile.id })
      : await supabase.from("reward_redemptions").delete().eq("student_id", studentId).eq("milestone_id", milestoneId);
    if (error && !(given && error.code === "23505")) return { ok: false, error: fail("setRewardGiven", error) };
  } catch (err) {
    console.error("[achievements] setRewardGiven lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidateAwards();
  return { ok: true, data: null };
}

// ============================================================================= Quản trị: danh mục huy hiệu & mốc quà

export async function saveBadge(input: BadgeInput): Promise<ActionResult<null>> {
  const parsed = badgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("admin");
  const { id, ...v } = parsed.data;
  try {
    const supabase = await createClient();
    const row = { name: v.name, emoji: v.emoji, description: v.description ?? null, tone: v.tone, active: v.active };
    const { error } = id
      ? await supabase.from("achievement_badges").update(row).eq("id", id)
      : await supabase.from("achievement_badges").insert({ ...row, code: `hh_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`, sort_order: 1000 });
    if (error) return { ok: false, error: fail("saveBadge", error) };
  } catch (err) {
    console.error("[achievements] saveBadge lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidatePath("/admin/achievements", "layout");
  revalidatePath("/teacher/achievements");
  revalidatePath("/parent", "layout");
  return { ok: true, data: null };
}

export async function saveMilestone(input: MilestoneInput): Promise<ActionResult<null>> {
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireRole("admin");
  const { id, ...v } = parsed.data;
  try {
    const supabase = await createClient();
    const row = { stars_required: v.starsRequired, title: v.title, emoji: v.emoji, description: v.description ?? null, active: v.active };
    const { error } = id ? await supabase.from("reward_milestones").update(row).eq("id", id) : await supabase.from("reward_milestones").insert(row);
    if (error) {
      if (error.code === "23505") return { ok: false, error: `Đã có mốc ${v.starsRequired} sao — hãy chọn số sao khác.` };
      return { ok: false, error: fail("saveMilestone", error) };
    }
  } catch (err) {
    console.error("[achievements] saveMilestone lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
  revalidatePath("/admin/achievements", "layout");
  revalidatePath("/teacher/achievements");
  revalidatePath("/parent", "layout");
  return { ok: true, data: null };
}
