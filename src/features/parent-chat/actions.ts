"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation";
import { requireRole } from "@/features/auth/queries";
import { normalizeContactPhone } from "@/features/feedback/schema";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";
import { normalizeVi } from "./knowledge-shared";

const requestSchema = z.object({
  question: z.string().trim().min(2, "Hãy nhập câu hỏi cần hỗ trợ").max(1000),
  /** Vài lượt trao đổi gần nhất với trợ lý — để Quản lý nắm bối cảnh, không phải hỏi lại */
  transcript: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(6).default([]),
  studentId: uuidSchema.nullish(),
});

function guessCategory(text: string): string {
  const q = ` ${normalizeVi(text)} `;
  if (/ (hoc phi|tien|thanh toan|chuyen khoan|hoan|phi) /.test(q)) return "hoc_phi";
  if (/ (co giao|giao vien|thay giao) /.test(q)) return "giao_vien";
  if (/ (co so|phong hoc|ve sinh|an toan) /.test(q)) return "co_so_vat_chat";
  if (/ (ung dung|app|dang nhap|mat khau) /.test(q)) return "ung_dung";
  return "khac";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * "Kết nối trực tiếp với Quản lý cơ sở" từ Trợ lý AI: gửi câu hỏi (+ tóm tắt trao đổi) vào kênh Góp ý & hỗ trợ
 * dạng "Thắc mắc", đề nghị gọi lại theo SĐT của tài khoản → quản trị nhận ở Bảng tin + Lắng nghe phụ huynh,
 * trả lời trong ứng dụng (phụ huynh nhận thông báo).
 */
export async function requestManagerHelp(input: z.input<typeof requestSchema>): Promise<ActionResult<null>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Yêu cầu không hợp lệ." };
  const profile = await requireRole("parent");
  const limit = await rateLimit("submitForm", `feedback:${profile.id}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };

  const { question, transcript, studentId } = parsed.data;
  const recap = transcript
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === "user" ? "Phụ huynh" : "Trợ lý"}: ${clip(m.content.replace(/\[KET_NOI_QUAN_LY\]/g, "").replace(/\s+/g, " ").trim(), 300)}`)
    .join("\n");
  const content = clip(`[Từ Trợ lý AI — phụ huynh đề nghị Quản lý cơ sở hỗ trợ]\nCâu hỏi: ${question}${recap ? `\n\nTrao đổi gần nhất:\n${recap}` : ""}`, 2000);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_feedback", {
      p_kind: "thac_mac",
      p_category: guessCategory(question),
      p_content: content,
      p_student_id: studentId ?? null,
      p_anonymous: false,
      p_contact_name: profile.full_name || null,
      p_contact_phone: profile.phone ? normalizeContactPhone(profile.phone) : null,
      p_wants_callback: Boolean(profile.phone),
    });
    if (error) {
      console.error("[parent-chat] requestManagerHelp lỗi:", error);
      return { ok: false, error: "Chưa gửi được yêu cầu. Ba mẹ vui lòng thử lại hoặc gọi hotline của trung tâm." };
    }
  } catch (err) {
    console.error("[parent-chat] requestManagerHelp lỗi:", err);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  schedulePushDelivery();
  revalidatePath("/parent/feedback");
  revalidatePath("/admin/feedback");
  return { ok: true, data: null };
}
