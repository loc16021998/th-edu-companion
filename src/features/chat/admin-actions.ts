"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/features/auth/queries";
import { sendPushToUsers } from "@/lib/push/server";
import type { ActionResult } from "@/types/action-result";

const CHAT_BUCKET = "chat";

/**
 * Quản trị viên gỡ tin nhắn không phù hợp: xoá nội dung + ảnh, giữ dấu vết (removed_at / removed_by).
 * Hai bên thấy ngay "Tin nhắn đã bị quản trị viên gỡ" (Realtime).
 */
export async function removeChatMessage(messageId: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false, error: "Tin nhắn không hợp lệ." };
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const { data: message, error: readError } = await supabase.from("chat_messages").select("image_path, removed_at").eq("id", messageId).maybeSingle();
  if (readError || !message) return { ok: false, error: "Không tìm thấy tin nhắn." };
  if (message.removed_at) return { ok: true, data: null };

  const { error } = await supabase
    .from("chat_messages")
    .update({ body: null, image_path: null, removed_at: new Date().toISOString(), removed_by: profile.id })
    .eq("id", messageId);
  if (error) {
    if (error.code === "PGRST204" || error.code === "42703" || error.code === "23514") {
      return { ok: false, error: "Database chưa cập nhật — chạy file supabase/apply-chat-moderation.sql." };
    }
    console.error("[chat] Gỡ tin nhắn thất bại:", error);
    return { ok: false, error: "Không gỡ được tin nhắn. Vui lòng thử lại." };
  }
  if (message.image_path) {
    const { error: storageError } = await supabase.storage.from(CHAT_BUCKET).remove([message.image_path]);
    if (storageError) console.warn("[chat] Không xoá được ảnh của tin đã gỡ:", storageError.message);
  }
  revalidatePath("/admin/chat");
  return { ok: true, data: null };
}

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

export type AdminSentMessage = { id: string; senderId: string; body: string | null; imagePath: string | null; createdAt: string };

/**
 * Quản trị viên trả lời trong cuộc trò chuyện phụ huynh ↔ giáo viên.
 * Hai bên thấy tin dưới tên "Trung tâm TH EDU" (realtime) và nhận thông báo đẩy.
 */
export async function adminSendChatMessage(input: z.input<typeof sendSchema>): Promise<ActionResult<AdminSentMessage>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Tin nhắn không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: v.conversationId, sender_id: profile.id, body: v.body || null, image_path: v.imagePath })
    .select("id, sender_id, body, image_path, created_at")
    .single();
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Database chưa cấp quyền — chạy file supabase/apply-admin-chat-reply.sql." };
    console.error("[chat] Quản trị gửi tin thất bại:", error);
    return { ok: false, error: "Không gửi được tin nhắn. Kiểm tra mạng rồi thử lại." };
  }

  after(async () => {
    try {
      const { data: conv } = await supabase.from("chat_conversations").select("parent_id, teacher_id").eq("id", v.conversationId).single();
      if (!conv) return;
      const body = v.body ? v.body.slice(0, 140) : "📷 Đã gửi một hình ảnh";
      await sendPushToUsers([conv.parent_id, conv.teacher_id], (userId) => ({
        title: "🏫 Trung tâm TH EDU",
        body,
        url: userId === conv.teacher_id ? `/teacher/chat?with=${conv.parent_id}` : `/parent/chat?with=${conv.teacher_id}`,
        tag: `chat:${v.conversationId}`,
      }));
    } catch (err) {
      console.warn("[chat] Gửi thông báo đẩy thất bại:", err);
    }
  });

  revalidatePath("/admin/chat");
  return { ok: true, data: { id: data.id, senderId: data.sender_id, body: data.body, imagePath: data.image_path, createdAt: data.created_at } };
}
