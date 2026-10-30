"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isISODate, startOfMonth, todayVN } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { SummaryAiUnavailable, buildTemplateSummary, generateSummaryWithClaude } from "./ai";
import { collectMonthData } from "./data";
import { schedulePushDelivery } from "@/features/push/deliver";

const CONNECTION_ERROR = "Không thể kết nối máy chủ. Vui lòng thử lại.";

const monthSchema = z
  .string()
  .refine(isISODate, "Tháng không hợp lệ")
  .transform((d) => startOfMonth(d));

const draftSchema = z.object({ studentId: z.string().uuid("Học sinh không hợp lệ"), month: monthSchema });

const saveSchema = draftSchema.extend({
  content: z.string().trim().min(20, "Nhận xét quá ngắn (tối thiểu 20 ký tự)").max(6000, "Nhận xét tối đa 6000 ký tự"),
  send: z.boolean(),
  aiGenerated: z.boolean(),
});

export type SummaryDraft = { content: string; aiGenerated: boolean; notice: string | null };

/**
 * Soạn bản nháp tổng kết tháng (KHÔNG lưu): gom 30 ngày điểm danh + sổ liên lạc → Claude viết.
 * Chưa có khoá AI / AI lỗi → bản nháp theo mẫu từ số liệu thật. Giáo viên xem lại, sửa rồi mới lưu / gửi.
 */
export async function generateMonthlySummaryDraft(studentId: string, month: string): Promise<ActionResult<SummaryDraft>> {
  const parsed = draftSchema.safeParse({ studentId, month });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("teacher", "admin");

  try {
    const supabase = await createClient();
    // RLS: giáo viên chỉ thấy học sinh mình phụ trách
    const { data: student } = await supabase
      .from("students")
      .select("id, full_name, class_name")
      .eq("id", parsed.data.studentId)
      .maybeSingle();
    if (!student) return { ok: false, error: "Không tìm thấy học sinh hoặc bạn không phụ trách học sinh này." };

    const data = await collectMonthData(student, parsed.data.month, todayVN());
    if (data.reportCount === 0 && data.attendance.present + data.attendance.late + data.attendance.absent === 0) {
      return { ok: false, error: "Chưa có điểm danh hay sổ liên lạc nào trong 30 ngày này để tổng kết." };
    }

    try {
      return { ok: true, data: { content: await generateSummaryWithClaude(data), aiGenerated: true, notice: null } };
    } catch (err) {
      const reason = err instanceof SummaryAiUnavailable ? err.message : "Không gọi được AI";
      return {
        ok: true,
        data: {
          content: buildTemplateSummary(data),
          aiGenerated: false,
          notice: `${reason} — đã tạo bản nháp theo mẫu từ số liệu thật. Thầy/cô vui lòng đọc và chỉnh sửa trước khi gửi.`,
        },
      };
    }
  } catch (err) {
    console.error("[monthly-summary] generate lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/** Lưu nháp hoặc gửi cho phụ huynh (gửi → phụ huynh nhận thông báo; gửi lại bản đã sửa → thông báo lại). */
export async function saveMonthlySummary(input: z.input<typeof saveSchema>): Promise<ActionResult<{ sent: boolean }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher", "admin");
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("monthly_summaries").upsert(
      {
        student_id: v.studentId,
        month: v.month,
        content: v.content,
        status: v.send ? "sent" : "draft",
        ai_generated: v.aiGenerated,
        teacher_id: profile.id,
        ...(v.send && { sent_at: new Date().toISOString() }),
      },
      { onConflict: "student_id,month" },
    );
    if (error) {
      console.error("[monthly-summary] save lỗi:", error);
      if (error.code === "PGRST205") return { ok: false, error: "Database chưa có bảng tổng kết tháng — hãy chạy supabase/apply-monthly-summaries.sql." };
      return { ok: false, error: dbErrorMessage(error) };
    }
  } catch (err) {
    console.error("[monthly-summary] save lỗi:", err);
    return { ok: false, error: CONNECTION_ERROR };
  }

  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
  // Đẩy thông báo lên điện thoại (Web Push / Zalo ZNS) ngay sau khi phản hồi
  schedulePushDelivery();
  return { ok: true, data: { sent: v.send } };
}
