import { z } from "zod";

export const MAX_CHAT_MESSAGE = 1000;
/** Số lượt gần nhất gửi lên model — giữ chi phí và độ trễ ổn định. */
export const MAX_CHAT_HISTORY = 16;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(60)
    .refine((m) => m[m.length - 1]?.role === "user", "Tin nhắn cuối phải là câu hỏi")
    .refine((m) => (m[m.length - 1]?.content.length ?? 0) <= MAX_CHAT_MESSAGE, `Câu hỏi tối đa ${MAX_CHAT_MESSAGE} ký tự`),
  /** Chỉ dùng cho /api/consult-chat: "teacher" = giáo viên đã đăng nhập (câu trả lời hướng tới việc của giáo viên). */
  audience: z.enum(["public", "teacher"]).optional(),
});

export type ChatAudience = "public" | "teacher";

export type ChatMessage = z.infer<typeof chatRequestSchema>["messages"][number];
