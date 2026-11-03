import { NextResponse } from "next/server";
import { fullDate, todayVN, weekdayLong } from "@/lib/date";
import { getAuthContext } from "@/features/auth/queries";
import { aiConfigured, streamClaudeReply, trimHistory } from "@/features/parent-chat/claude";
import { buildFamilyContext } from "@/features/parent-chat/context";
import { faqResponse } from "@/features/parent-chat/faq";
import { activeKnowledge } from "@/features/parent-chat/knowledge";
import { ESCALATE_MARKER, bestArticle, knowledgePrompt, needsManager, selectKnowledge } from "@/features/parent-chat/knowledge-shared";
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
  if (!aiConfigured()) {
    // Chưa bật AI: ưu tiên bài trong kho kiến thức của trung tâm, rồi mới tới câu trả lời soạn sẵn
    const question = history[history.length - 1]?.content ?? "";
    const escalate = needsManager(question);
    // Khiếu nại / sự cố → chỉ mời kết nối Quản lý, không trích tài liệu (tránh trả lời lạc đề cho phụ huynh đang bức xúc)
    const article = escalate ? null : bestArticle(await activeKnowledge(), question);
    if (!article && !escalate) return faqResponse(question);
    const text = [
      article ? `Theo tài liệu của trung tâm — "${article.title}":\n${article.content.trim()}` : null,
      escalate ? "Việc này cần người của trung tâm trực tiếp xử lý. Ba mẹ vui lòng bấm nút kết nối trực tiếp với Quản lý cơ sở để được hỗ trợ nhanh nhất nhé." : null,
      escalate ? ESCALATE_MARKER : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const today = todayVN();
  const [context, articles] = await Promise.all([
    buildFamilyContext(today).catch((err: unknown) => {
      console.error("[parent-chat] buildFamilyContext lỗi:", err);
      return "(Hiện không tải được dữ liệu của các con.)";
    }),
    activeKnowledge(),
  ]);
  // Kho kiến thức: nhỏ → đưa toàn bộ (giống nhau cho mọi phụ huynh → nằm trong vùng cache); lớn → chọn bài sát câu hỏi gần đây
  const recentQuestions = history.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n");
  const knowledge = selectKnowledge(articles, recentQuestions);

  return streamClaudeReply({
    system: [
      // Phần cố định (+ toàn bộ kho kiến thức nếu đưa hết) → cache dùng chung cho mọi phụ huynh
      { type: "text", text: STABLE_SYSTEM_PROMPT, ...(!knowledge.all && { cache_control: { type: "ephemeral" as const } }) },
      { type: "text", text: knowledgePrompt(knowledge.picked), ...(knowledge.all && { cache_control: { type: "ephemeral" as const } }) },
      { type: "text", text: familyContextPrompt(`${weekdayLong(today)}, ${fullDate(today)}`, context, ctx.profile.full_name) },
    ],
    messages: history,
    signal: request.signal,
  });
}
