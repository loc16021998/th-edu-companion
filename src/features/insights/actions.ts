"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/server";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { todayVN } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import { collectMonthData, monthDataToText } from "@/features/monthly-summary/data";
import type { ActionResult } from "@/types/action-result";
import { MAX_360, aiConfigured, aiIntervention, aiReport360 } from "./ai";
import { ruleInterventions } from "./interventions";
import { loadWindows } from "./queries";
import { buildTemplate360, homeworkStats, homeworkText } from "./report360";
import { analyzeStudent, signalsFingerprint } from "./risk";

export type InsightText = { content: string; source: "ai" | "template" | "saved"; notice: string | null };

const missingTable = (code?: string) => code === "PGRST205" || code === "42P01";
const revalidate = () => {
  revalidatePath("/teacher/analytics");
  revalidatePath("/admin/insights");
};

/** Học sinh (RLS: giáo viên chỉ đọc lớp mình phụ trách, quản trị đọc tất cả) + phân tích 30 ngày. */
async function loadStudent(studentId: string) {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id, full_name, class_name, campus, parent_id").eq("id", studentId).maybeSingle();
  if (!student) return null;
  const today = todayVN();
  const window = (await loadWindows([student], today)).get(student.id)!;
  const risk = analyzeStudent(window, today);
  return { supabase, student, today, window, risk, childName: givenName(student.full_name) };
}

async function guard() {
  const profile = await requireRole("teacher", "admin");
  const limit = await rateLimit("aiInsight", profile.id);
  return { profile, error: limit.ok ? null : tooManyMessage(limit.retryAfter) };
}

/**
 * "✨ AI gợi ý can thiệp" cho 1 học sinh. Đã có gợi ý AI cho ĐÚNG các cảnh báo hiện tại → dùng lại (không gọi AI lại),
 * trừ khi `refresh`. Chưa bật AI / AI lỗi → gợi ý theo quy tắc.
 */
export async function generateIntervention(studentId: string, refresh = false): Promise<ActionResult<InsightText>> {
  if (!uuidSchema.safeParse(studentId).success) return { ok: false, error: "Học sinh không hợp lệ." };
  const { profile, error: limitError } = await guard();
  if (limitError) return { ok: false, error: limitError };
  const ctx = await loadStudent(studentId);
  if (!ctx) return { ok: false, error: "Không tìm thấy học sinh trong lớp bạn phụ trách." };
  const fingerprint = signalsFingerprint(ctx.risk.signals);

  if (!refresh) {
    const { data: saved } = await ctx.supabase.from("student_insight_notes").select("content, fingerprint").eq("student_id", studentId).eq("kind", "intervention").maybeSingle();
    if (saved && saved.fingerprint === fingerprint) return { ok: true, data: { content: saved.content, source: "saved", notice: null } };
  }

  const rules = ruleInterventions(ctx.childName, ctx.risk.signals).map((t) => `- ${t}`).join("\n") || `- Bé ${ctx.childName} đang ổn định — tiếp tục khen ngợi và giao bài vừa sức.`;
  if (!aiConfigured()) return { ok: true, data: { content: rules, source: "template", notice: "Trung tâm chưa bật AI — đây là gợi ý theo quy tắc từ các cảnh báo." } };

  const data = await collectMonthData(ctx.student, ctx.today, ctx.today);
  const content = await aiIntervention(ctx.childName, ctx.risk.signals, monthDataToText(data));
  if (!content) return { ok: true, data: { content: rules, source: "template", notice: "AI đang bận — đây là gợi ý theo quy tắc từ các cảnh báo." } };

  const { error } = await ctx.supabase
    .from("student_insight_notes")
    .upsert(
      { student_id: studentId, kind: "intervention", fingerprint, content, ai_generated: true, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "student_id,kind" },
    );
  if (error && !missingTable(error.code)) console.error("[insights] Không lưu được gợi ý:", error);
  revalidate();
  return { ok: true, data: { content, source: "ai", notice: null } };
}

/** Soạn "Nhận xét chiều sâu 360°" (AI hoặc theo mẫu) → lưu bản nháp để giáo viên sửa / gửi. */
export async function generateReport360(studentId: string): Promise<ActionResult<InsightText>> {
  if (!uuidSchema.safeParse(studentId).success) return { ok: false, error: "Học sinh không hợp lệ." };
  const { profile, error: limitError } = await guard();
  if (limitError) return { ok: false, error: limitError };
  const ctx = await loadStudent(studentId);
  if (!ctx) return { ok: false, error: "Không tìm thấy học sinh trong lớp bạn phụ trách." };

  const data = await collectMonthData(ctx.student, ctx.today, ctx.today);
  const hw = homeworkStats(ctx.window.homework, ctx.today);
  const ai = aiConfigured() ? await aiReport360(ctx.childName, ctx.risk.signals, monthDataToText(data), homeworkText(hw)) : null;
  const content = ai ?? buildTemplate360(data, hw, ctx.risk.signals);
  const notice = ai ? null : aiConfigured() ? "AI đang bận — đây là bản soạn theo mẫu từ số liệu thật, cô sửa thêm cho tự nhiên nhé." : "Trung tâm chưa bật AI — đây là bản soạn theo mẫu từ số liệu thật, cô sửa thêm cho tự nhiên nhé.";

  const { error } = await ctx.supabase
    .from("student_insight_notes")
    .upsert(
      { student_id: studentId, kind: "report360", content, ai_generated: Boolean(ai), sent_at: null, updated_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "student_id,kind" },
    );
  if (error && !missingTable(error.code)) console.error("[insights] Không lưu được bản 360°:", error);
  revalidate();
  return { ok: true, data: { content, source: ai ? "ai" : "template", notice } };
}

const contentSchema = z.string().trim().min(20, "Nội dung quá ngắn").max(MAX_360, `Tối đa ${MAX_360} ký tự (vừa 1 tin nhắn)`);

export async function saveReport360(studentId: string, content: string): Promise<ActionResult<null>> {
  const parsed = contentSchema.safeParse(content);
  if (!uuidSchema.safeParse(studentId).success || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher", "admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_insight_notes")
    .upsert({ student_id: studentId, kind: "report360", content: parsed.data, updated_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: "student_id,kind" });
  if (error) return { ok: false, error: missingTable(error.code) ? "Chưa cài đặt — chạy file supabase/apply-student-insights.sql." : "Chưa lưu được bản nháp." };
  revalidate();
  return { ok: true, data: null };
}

/**
 * Giáo viên gửi riêng bản 360° cho phụ huynh qua Nhắn tin (mở cuộc trò chuyện nếu chưa có).
 * RLS của chat kiểm tra giáo viên còn phụ trách lớp của bé.
 */
export async function sendReport360(studentId: string, content: string): Promise<ActionResult<null>> {
  const parsed = contentSchema.safeParse(content);
  if (!uuidSchema.safeParse(studentId).success || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("teacher");
  const limit = await rateLimit("chatMessage", profile.id);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };

  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("full_name, parent_id").eq("id", studentId).maybeSingle();
  if (!student) return { ok: false, error: "Không tìm thấy học sinh trong lớp bạn phụ trách." };
  if (!student.parent_id) return { ok: false, error: "Bé chưa được liên kết tài khoản phụ huynh — hãy sao chép hoặc in bản nhận xét." };

  const pair = { parent_id: student.parent_id, teacher_id: profile.id };
  await supabase.from("chat_conversations").upsert(pair, { onConflict: "parent_id,teacher_id", ignoreDuplicates: true });
  const { data: conv } = await supabase.from("chat_conversations").select("id").eq("parent_id", pair.parent_id).eq("teacher_id", pair.teacher_id).maybeSingle();
  if (!conv) return { ok: false, error: "Chưa mở được cuộc trò chuyện với phụ huynh của bé." };

  const body = `📋 Nhận xét chiều sâu 360° — bé ${givenName(student.full_name)}\n\n${parsed.data}`.slice(0, 2000);
  const { error } = await supabase.from("chat_messages").insert({ conversation_id: conv.id, sender_id: profile.id, body });
  if (error) {
    console.error("[insights] Gửi bản 360° thất bại:", error);
    return { ok: false, error: error.code === "42501" ? "Bạn không còn quyền nhắn tin với phụ huynh của bé." : "Chưa gửi được. Kiểm tra mạng rồi thử lại." };
  }
  await supabase
    .from("student_insight_notes")
    .upsert({ student_id: studentId, kind: "report360", content: parsed.data, sent_at: new Date().toISOString(), updated_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: "student_id,kind" });

  const parentId = student.parent_id;
  after(async () => {
    try {
      await sendPushToUsers([parentId], () => ({
        title: `💬 ${profile.full_name || "Giáo viên"}`,
        body: `Nhận xét chiều sâu 360° của bé ${givenName(student.full_name)}`,
        url: `/parent/chat?with=${profile.id}`,
        tag: `chat:${conv.id}`,
      }));
    } catch (err) {
      console.warn("[insights] Gửi thông báo đẩy thất bại:", err);
    }
  });
  revalidate();
  return { ok: true, data: null };
}
