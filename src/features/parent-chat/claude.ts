import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { HANDOFF_HINT, faqAnswer } from "./faq";
import type { ChatMessage } from "./schema";

const MODEL = "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Gọi Claude và trả về Response stream chữ (text/plain) cho giao diện chat.
 * Lỗi phía AI → tự chuyển sang câu trả lời soạn sẵn (ưu tiên luôn có trả lời tự động).
 */
export function streamClaudeReply({
  system,
  messages,
  signal,
  audience = "public",
}: {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: ChatMessage[];
  signal: AbortSignal;
  /** Bộ câu trả lời soạn sẵn dùng khi AI lỗi */
  audience?: "public" | "teacher";
}): Response {
  const client = new Anthropic();
  const encoder = new TextEncoder();
  const lastQuestion = messages[messages.length - 1]?.content ?? "";

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 8000,
      // Hỏi đáp ngắn → effort thấp cho phản hồi nhanh (Opus 5.5 luôn bật adaptive thinking)
      output_config: { effort: "low" },
      // Bộ phân loại an toàn có thể từ chối nhầm → tự chạy lại trên model dự phòng Anthropic khuyến nghị
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { signal },
  );

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            sent = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode(`${sent ? "\n\n" : ""}Xin lỗi, em chưa thể trả lời câu hỏi này. ${HANDOFF_HINT}`));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("…"));
        }
      } catch (err) {
        if (signal.aborted) return; // người dùng bấm dừng / đóng trang
        console.error("[chat] Lỗi khi gọi Claude:", err);
        // Chưa trả lời được chữ nào → dùng câu trả lời soạn sẵn; đang trả lời dở → mời gặp tư vấn viên
        controller.enqueue(
          encoder.encode(
            sent
              ? `\n\n⚠️ Trợ lý tạm gián đoạn. ${HANDOFF_HINT}`
              : err instanceof Anthropic.RateLimitError
                ? `Trợ lý đang quá tải. ${faqAnswer(lastQuestion, audience)}`
                : faqAnswer(lastQuestion, audience),
          ),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no", // tắt buffer của nginx để chữ hiện dần
    },
  });
}

/** Giữ N lượt gần nhất, bắt đầu bằng câu hỏi của người dùng. */
export function trimHistory(messages: ChatMessage[], max: number): ChatMessage[] {
  let history = messages.slice(-max);
  while (history[0]?.role === "assistant") history = history.slice(1);
  return history;
}
