"use server";

import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/server";
import { rateLimit, tooManyMessage } from "@/lib/security/rate-limit";
import { requireRole } from "@/features/auth/queries";
import type { ActionResult } from "@/types/action-result";

const sendSchema = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().trim().max(2000, "Tin nhắn tối đa 2000 ký tự"),
    imagePath: z
      .string()
      .regex(/^[0-9a-f-]{36}\/[\w.-]{1,100}\.(jpe?g|png|webp|gif)$/i, "Ảnh không hợp lệ")
      .nullable(),
  })
  .refine((v) => v.body || v.imagePath, { message: "Tin nhắn trống" })
  .refine((v) => !v.imagePath || v.imagePath.startsWith(`${v.conversationId}/`), { message: "Ảnh không thuộc cuộc trò chuyện" });

export type SentMessage = { id: string; senderId: string; body: string | null; imagePath: string | null; createdAt: string };

/**
 * Gửi tin (RLS: đúng người trong cuộc + vẫn còn quyền chat). Bên kia nhận qua Supabase Realtime;
 * nếu đã bật thông báo đẩy thì điện thoại cũng rung ngay cả khi không mở app.
 */
export async function sendChatMessage(input: z.input<typeof sendSchema>): Promise<ActionResult<SentMessage>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Tin nhắn không hợp lệ." };
  const profile = await requireRole("parent", "teacher");
  const v = parsed.data;
  const limit = await rateLimit("chatMessage", profile.id);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfter) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: v.conversationId, sender_id: profile.id, body: v.body || null, image_path: v.imagePath })
    .select("id, sender_id, body, image_path, created_at")
    .single();
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Bạn không còn quyền nhắn tin trong cuộc trò chuyện này (bé đã chuyển lớp?)." };
    console.error("[chat] Gửi tin thất bại:", error);
    return { ok: false, error: "Không gửi được tin nhắn. Kiểm tra mạng rồi thử lại." };
  }

  // Thông báo đẩy cho người nhận (sau khi phản hồi, không làm chậm việc gửi)
  after(async () => {
    try {
      const { data: conv } = await supabase.from("chat_conversations").select("parent_id, teacher_id").eq("id", v.conversationId).single();
      if (!conv) return;
      const recipient = conv.parent_id === profile.id ? conv.teacher_id : conv.parent_id;
      const recipientIsTeacher = recipient === conv.teacher_id;
      await sendPushToUsers([recipient], () => ({
        title: `💬 ${profile.full_name || (recipientIsTeacher ? "Phụ huynh" : "Giáo viên")}`,
        body: v.body ? v.body.slice(0, 140) : "📷 Đã gửi một hình ảnh",
        url: `${recipientIsTeacher ? "/teacher/chat" : "/parent/chat"}?with=${profile.id}`,
        tag: `chat:${v.conversationId}`,
      }));
    } catch (err) {
      console.warn("[chat] Gửi thông báo đẩy thất bại:", err);
    }
  });

  return { ok: true, data: { id: data.id, senderId: data.sender_id, body: data.body, imagePath: data.image_path, createdAt: data.created_at } };
}
