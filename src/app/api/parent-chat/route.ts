import { NextResponse } from "next/server";
import { fullDate, todayVN, weekdayLong } from "@/lib/date";
import { getAuthContext } from "@/features/auth/queries";
import { aiConfigured, streamClaudeReply, trimHistory } from "@/features/parent-chat/claude";
import { buildFamilyContext } from "@/features/parent-chat/context";
import { faqResponse } from "@/features/parent-chat/faq";
import { STABLE_SYSTEM_PROMPT, familyContextPrompt } from "@/features/parent-chat/prompt";
import { rateLimit, retryAfterText } from "@/lib/security/rate-limit";
import { MAX_CHAT_HISTORY, chatRequestSchema } from "@/features/parent-chat/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Chat tư vấn cho phụ huynh ĐÃ đăng nhập — trả lời dựa trên dữ liệu thật của con.
 * Chưa cấu hình AI → trả lời tự động soạn sẵn. Trả về text/plain dạng stream.
 */
export async function POST(request: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return jsonError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  if (ctx.profile.role !== "parent") return jsonError(403, "Trợ lý ảo chỉ dành cho phụ huynh.");

  const body: unknown = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ.");

  const limit = await rateLimit("parentChat", ctx.profile.id);
  if (!limit.ok) return jsonError(429, `Anh/chị hỏi hơi nhanh, vui lòng thử lại sau ${retryAfterText(limit.retryAfter)}.`);

  const history = trimHistory(parsed.data.messages, MAX_CHAT_HISTORY);
  if (!aiConfigured()) return faqResponse(history[history.length - 1]?.content ?? "");

  const today = todayVN();
  const context = await buildFamilyContext(today).catch((err: unknown) => {
    console.error("[parent-chat] buildFamilyContext lỗi:", err);
    return "(Hiện không tải được dữ liệu của các con.)";
  });

  return streamClaudeReply({
    system: [
      // Phần cố định → cache dùng chung cho mọi phụ huynh
      { type: "text", text: STABLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: familyContextPrompt(`${weekdayLong(today)}, ${fullDate(today)}`, context, ctx.profile.full_name) },
    ],
    messages: history,
    signal: request.signal,
  });
}
