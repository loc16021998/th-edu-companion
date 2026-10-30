import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type MonthlySummary = Tables<"monthly_summaries">;

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

/** Tổng kết của 1 tháng (giáo viên: cả nháp; phụ huynh: RLS chỉ trả bản đã gửi). */
export async function getMonthlySummary(
  studentId: string,
  monthStart: string,
): Promise<{ available: boolean; summary: MonthlySummary | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_summaries")
    .select("id, student_id, teacher_id, month, content, status, ai_generated, sent_at, created_at, updated_at")
    .eq("student_id", studentId)
    .eq("month", monthStart)
    .maybeSingle();
  if (error) {
    if (isMissing(error.code)) return { available: false, summary: null };
    throw new Error("Không tải được tổng kết tháng", { cause: error });
  }
  return { available: true, summary: data };
}

/** Các bản tổng kết đã gửi (mới nhất trước) — lịch sử cho phụ huynh. */
export async function listSentSummaries(studentId: string, limit = 12): Promise<MonthlySummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_summaries")
    .select("id, student_id, teacher_id, month, content, status, ai_generated, sent_at, created_at, updated_at")
    .eq("student_id", studentId)
    .eq("status", "sent")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error("Không tải được tổng kết tháng", { cause: error });
  }
  return data;
}
