import { NextResponse } from "next/server";
import { fullDate, todayVN, weekdayLong } from "@/lib/date";
import { aiConfigured, streamClaudeReply, trimHistory } from "@/features/parent-chat/claude";
import { faqResponse } from "@/features/parent-chat/faq";
import { PUBLIC_CONTEXT_PROMPT, STABLE_SYSTEM_PROMPT, TEACHER_CONTEXT_PROMPT } from "@/features/parent-chat/prompt";
import { ipFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import { chatRequestSchema } from "@/features/parent-chat/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lượt hội thoại tối đa gửi lên AI cho khách — ngắn hơn phụ huynh để hạn chế chi phí. */
const PUBLIC_HISTORY = 8;

/**
 * Chat tư vấn CÔNG KHAI (trang đăng nhập, khách chưa đăng nhập) — không truy cập dữ liệu học sinh.
 * Ưu tiên trả lời tự động: AI nếu đã cấu hình, ngược lại câu trả lời soạn sẵn.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ." }, { status: 400 });
  }

  const history = trimHistory(parsed.data.messages, PUBLIC_HISTORY);
  const question = history[history.length - 1]?.content ?? "";

  // Chặn spam theo IP; vượt giới hạn vẫn trả lời bằng câu soạn sẵn (không tốn chi phí AI)
  const limited = !(await rateLimit("consultChat", ipFromHeaders(request.headers))).ok;
  // "teacher": giáo viên đã đăng nhập — chỉ đổi giọng/nội dung hướng dẫn, KHÔNG mở thêm dữ liệu nào
  const audience = parsed.data.audience ?? "public";
  if (limited || !aiConfigured()) return faqResponse(question, audience);

  const today = todayVN();
  const context = audience === "teacher" ? TEACHER_CONTEXT_PROMPT : PUBLIC_CONTEXT_PROMPT;
  return streamClaudeReply({
    system: [
      { type: "text", text: STABLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `${context}\nHôm nay là ${weekdayLong(today)}, ${fullDate(today)}.` },
    ],
    messages: history,
    signal: request.signal,
    audience,
  });
}
