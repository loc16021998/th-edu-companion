"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { todayVN } from "@/lib/date";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { SURVEY_COMMENT_MAX, surveyPeriod } from "./constants";

const star = z.number().int().min(1).max(5);
const answerSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  rating: star,
  subjectRatings: z.object({ tien_tieu_hoc: star.optional(), luyen_chu: star.optional(), toan_tu_duy: star.optional() }).strict(),
  comment: z.string().trim().max(SURVEY_COMMENT_MAX, `Nhận xét tối đa ${SURVEY_COMMENT_MAX} ký tự`).optional().default(""),
});

const ALREADY = "Anh/chị đã trả lời khảo sát tháng này rồi. Cảm ơn anh/chị!";
const MIGRATION = "Khảo sát đang được trung tâm cài đặt, anh/chị vui lòng quay lại sau.";

/** Chỉ nhận khảo sát của tháng hiện tại (không gửi bù / gửi trước). */
async function insertSurvey(row: { period: string; status: "answered" | "declined"; rating?: number; subject_ratings?: Record<string, number>; comment?: string | null }) {
  const profile = await requireRole("parent");
  if (row.period !== surveyPeriod(todayVN())) return { ok: false as const, error: "Đợt khảo sát này đã kết thúc." };
  const limit = await rateLimit("submitForm", `survey:${profile.id}`);
  if (!limit.ok) return { ok: false as const, error: tooManyMessage(limit.retryAfter) };
  const supabase = await createClient();
  const { error } = await supabase.from("satisfaction_surveys").insert({ parent_id: profile.id, ...row });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: ALREADY };
    if (error.code === "PGRST205" || error.code === "42P01") return { ok: false as const, error: MIGRATION };
    console.error("[survey] Lưu khảo sát lỗi:", error);
    return { ok: false as const, error: dbErrorMessage(error) };
  }
  return { ok: true as const, data: null };
}

export async function submitSurvey(input: z.input<typeof answerSchema>): Promise<ActionResult<null>> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vui lòng chấm điểm từ 1 đến 5 sao." };
  const v = parsed.data;
  const res = await insertSurvey({ period: v.period, status: "answered", rating: v.rating, subject_ratings: v.subjectRatings, comment: v.comment || null });
  if (res.ok) {
    revalidatePath("/admin/feedback");
    schedulePushDelivery(); // chấm thấp → thông báo hoạt động cho quản trị viên
  }
  return res;
}

/** "Không hỏi lại tháng này" */
export async function declineSurvey(period: string): Promise<ActionResult<null>> {
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const res = await insertSurvey({ period, status: "declined" });
  return res.ok || res.error === ALREADY ? { ok: true, data: null } : res;
}
