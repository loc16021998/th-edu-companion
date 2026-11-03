"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z4 from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { givenName } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";
import { getReportAiSettings } from "./ai-settings";
import { aiNoteRequestSchema, buildTemplateNotes, describeSelection, selectionCount, type AiNoteRequest } from "./ai-tags";

const MODEL = "claude-opus-5-5";
const MAX_NOTE = 600;

const SYSTEM = `Bạn là trợ lý giáo viên tại Hệ thống giáo dục TH EDU (chuyên Tiền tiểu học, Luyện chữ đẹp, Toán tư duy cho trẻ 4–7 tuổi).
Nhiệm vụ: viết nhận xét ngắn trong Sổ liên lạc hằng ngày gửi phụ huynh của một bé, dựa trên đánh giá nhanh của cô giáo.

Yêu cầu:
- Tiếng Việt. Xưng "Cô" (hoặc "Trung tâm"), gọi bé là "con" hoặc "bé <tên>", gọi phụ huynh là "Ba mẹ".
- Văn phong ấm áp, tích cực, mang tính xây dựng: khen điểm tốt trước, sau đó nhắc khéo léo điểm cần rèn luyện (nếu có) kèm lời động viên.
- Tuyệt đối không dùng từ ngữ tiêu cực nặng nề, không so sánh với bạn khác, không phán xét tính cách.
- CHỈ dựa vào thông tin được cung cấp; không bịa thêm hoạt động, bài học, con số hay sự việc.
- Mỗi phương án 2–3 câu (tối đa 4 câu), dưới 450 ký tự, văn xuôi liền mạch: không tiêu đề, không markdown, không gạch đầu dòng, không emoji.
- Viết 3 phương án khác nhau rõ rệt về cách diễn đạt: (1) ngắn gọn, (2) ấm áp chi tiết hơn, (3) có thêm 1 gợi ý nhỏ Ba mẹ làm cùng con ở nhà.`;

const OutputSchema = z4.object({ options: z4.array(z4.string()) });

export type AiNoteResult = {
  options: string[];
  /** "ai": Claude viết; "template": soạn theo mẫu (chưa cấu hình AI / AI lỗi) */
  source: "ai" | "template";
  notice: string | null;
};

/** Claude viết 2–3 phương án nhận xét. Lỗi / bị từ chối → null (bên gọi dùng mẫu dự phòng). */
async function askClaude(childName: string, input: AiNoteRequest, styleNote: string): Promise<string[] | null> {
  const { lines } = describeSelection(input);
  // Chỉ gửi tên gọi của bé + các nhận xét đã chọn (không họ tên đầy đủ, không dữ liệu cá nhân khác)
  const prompt = `Tên gọi của bé: ${childName}\nĐánh giá nhanh của cô hôm nay:\n${lines.join("\n")}\n\nHãy viết 3 phương án nhận xét.`;
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // Đoạn văn ngắn, giáo viên đang chờ → effort thấp cho phản hồi nhanh (Opus 5.5 luôn bật adaptive thinking)
      output_config: { effort: "low", format: betaZodOutputFormat(OutputSchema) },
      // Bộ phân loại an toàn có thể từ chối nhầm → tự chạy lại trên model dự phòng Anthropic khuyến nghị
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM },
        ...(styleNote
          ? [{ type: "text" as const, text: `Lưu ý văn phong của Ban quản lý trung tâm (áp dụng khi không trái các yêu cầu trên): ${styleNote}` }]
          : []),
      ],
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return null;
    const options = (response.parsed_output?.options ?? [])
      .map((o) => o.replace(/\s+/g, " ").trim())
      .filter((o) => o.length >= 20 && o.length <= MAX_NOTE)
      .slice(0, 3);
    return options.length ? options : null;
  } catch (err) {
    console.error("[ai-report] Lỗi khi gọi Claude:", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return null;
  }
}

/**
 * "✨ Dùng AI gợi ý nhận xét": thu các tag đánh giá nhanh + tên bé → 2–3 phương án nhận xét để giáo viên chọn rồi sửa.
 * Tên bé lấy từ database (RLS: giáo viên chỉ đọc được học sinh lớp mình) — không tin tên gửi từ trình duyệt.
 */
export async function generateAIReportNote(input: AiNoteRequest): Promise<ActionResult<AiNoteResult>> {
  const parsed = aiNoteRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Lựa chọn đánh giá không hợp lệ — tải lại trang rồi thử lại." };
  const v = parsed.data;
  if (selectionCount(v) === 0) return { ok: false, error: "Chọn ít nhất 1 đánh giá nhanh để AI có thông tin viết nhận xét." };

  const profile = await requireRole("teacher", "admin");
  const limit = await rateLimit("aiReportNote", profile.id);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };

  const supabase = await createClient();
  const { data: student, error } = await supabase.from("students").select("full_name").eq("id", v.studentId).maybeSingle();
  if (error) {
    console.error("[ai-report] Không đọc được học sinh:", error);
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }
  if (!student) return { ok: false, error: "Không tìm thấy học sinh trong lớp bạn phụ trách." };
  const childName = givenName(student.full_name);

  // Quản trị: tắt trợ lý → từ chối; tắt AI → chỉ gợi ý theo mẫu; lưu ý văn phong → thêm vào hướng dẫn cho AI
  const settings = await getReportAiSettings();
  if (!settings.assistantEnabled) return { ok: false, error: "Ban quản lý đã tạm tắt Trợ lý viết nhận xét." };

  let result: AiNoteResult;
  const options = settings.aiEnabled && process.env.ANTHROPIC_API_KEY ? await askClaude(childName, v, settings.styleNote) : null;
  if (options) result = { options, source: "ai", notice: null };
  else {
    const why = !settings.aiEnabled
      ? "Trung tâm đang dùng gợi ý theo mẫu"
      : process.env.ANTHROPIC_API_KEY
        ? "AI đang bận"
        : "Trung tâm chưa bật AI";
    result = { options: buildTemplateNotes(childName, v), source: "template", notice: `${why} — đây là gợi ý soạn theo mẫu từ các đánh giá bạn chọn.` };
  }

  // Nhật ký cho thống kê của quản trị (không lưu nội dung). Lỗi ghi nhật ký không ảnh hưởng giáo viên.
  const { error: logError } = await supabase
    .from("ai_note_events")
    .insert({ actor_id: profile.id, student_id: v.studentId, source: result.source, tag_count: selectionCount(v) });
  if (logError && !["PGRST205", "42P01"].includes(logError.code)) console.error("[ai-report] Không ghi được nhật ký:", logError);

  return { ok: true, data: result };
}
