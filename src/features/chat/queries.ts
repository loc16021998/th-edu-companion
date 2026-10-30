import "server-only";
import { createClient } from "@/lib/supabase/server";

export const CHAT_BUCKET = "chat";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883";
}

type MessageRow = { id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string; removed_at: string | null };

/**
 * Tin nhắn mới nhất của 1 cuộc trò chuyện (đúng các cột cần dùng).
 * DB chưa chạy migration gỡ tin (chưa có cột removed_at) → đọc lại không có cột đó.
 */
export async function fetchMessages(supabase: Awaited<ReturnType<typeof createClient>>, conversationId: string, limit: number): Promise<MessageRow[]> {
  const run = (columns: string) =>
    supabase.from("chat_messages").select(columns).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit);
  let res = await run("id, sender_id, body, image_path, created_at, removed_at");
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) res = await run("id, sender_id, body, image_path, created_at");
  if (res.error) throw new Error("Không tải được tin nhắn", { cause: res.error });
  return (res.data as unknown as (Omit<MessageRow, "removed_at"> & { removed_at?: string | null })[]).map((m) => ({ ...m, removed_at: m.removed_at ?? null })).reverse();
}

export type ChatContact = {
  id: string;
  name: string;
  role: "parent" | "teacher";
  /** Con / học sinh liên quan + lớp */
  children: string[];
  classes: string[];
  conversation: {
    id: string;
    lastMessageAt: string | null;
    preview: string | null;
    lastSenderId: string | null;
    unread: boolean;
  } | null;
};

/** Danh bạ chat (đúng quyền: phụ huynh ↔ giáo viên phụ trách lớp con) + cuộc trò chuyện đã có, mới nhất trước. */
export async function getChatInbox(me: { id: string; role: string }): Promise<{ available: boolean; contacts: ChatContact[] }> {
  const supabase = await createClient();
  const [contactsRes, convRes] = await Promise.all([
    supabase.rpc("chat_contacts"),
    supabase.from("chat_conversations").select("id, parent_id, teacher_id, last_message_at, last_message_preview, last_sender_id, parent_last_read_at, teacher_last_read_at").or(`parent_id.eq.${me.id},teacher_id.eq.${me.id}`),
  ]);
  if (contactsRes.error || convRes.error) {
    const err = contactsRes.error ?? convRes.error;
    if (isMissing(err?.code)) return { available: false, contacts: [] };
    throw new Error("Không tải được danh sách trò chuyện", { cause: err });
  }

  const convByContact = new Map(convRes.data.map((c) => [c.parent_id === me.id ? c.teacher_id : c.parent_id, c]));
  const contacts: ChatContact[] = contactsRes.data.map((c) => {
    const conv = convByContact.get(c.contact_id);
    const myRead = conv ? (conv.parent_id === me.id ? conv.parent_last_read_at : conv.teacher_last_read_at) : null;
    return {
      id: c.contact_id,
      name: c.full_name || (c.role === "teacher" ? "Giáo viên" : "Phụ huynh"),
      role: c.role === "teacher" ? "teacher" : "parent",
      children: c.children,
      classes: c.classes,
      conversation: conv
        ? {
            id: conv.id,
            lastMessageAt: conv.last_message_at,
            preview: conv.last_message_preview,
            lastSenderId: conv.last_sender_id,
            unread: Boolean(conv.last_message_at && conv.last_sender_id !== me.id && (!myRead || myRead < conv.last_message_at)),
          }
        : null,
    };
  });
  contacts.sort((a, b) => (b.conversation?.lastMessageAt ?? "").localeCompare(a.conversation?.lastMessageAt ?? "") || a.name.localeCompare(b.name, "vi"));
  return { available: true, contacts };
}

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  createdAt: string;
  /** Quản trị viên đã gỡ tin này */
  removed?: boolean;
};

/** Mở (tạo nếu chưa có) cuộc trò chuyện với 1 liên hệ hợp lệ + 60 tin gần nhất. RLS kiểm tra quyền chat. */
export async function openConversation(me: { id: string; role: string }, contact: ChatContact) {
  const supabase = await createClient();
  const pair = me.role === "teacher" ? { parent_id: contact.id, teacher_id: me.id } : { parent_id: me.id, teacher_id: contact.id };

  let conversationId = contact.conversation?.id ?? null;
  if (!conversationId) {
    await supabase.from("chat_conversations").upsert(pair, { onConflict: "parent_id,teacher_id", ignoreDuplicates: true });
    const { data } = await supabase.from("chat_conversations").select("id").eq("parent_id", pair.parent_id).eq("teacher_id", pair.teacher_id).maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId) return null;

  const [rows, convRes] = await Promise.all([
    fetchMessages(supabase, conversationId, 60),
    supabase.from("chat_conversations").select("parent_id, parent_last_read_at, teacher_last_read_at").eq("id", conversationId).single(),
  ]);
  const paths = rows.flatMap((m) => (m.image_path ? [m.image_path] : []));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  }
  const otherReadAt = convRes.data ? (convRes.data.parent_id === me.id ? convRes.data.teacher_last_read_at : convRes.data.parent_last_read_at) : null;

  return {
    conversationId,
    otherReadAt,
    messages: rows.map(
      (m): ChatMessage => ({
        id: m.id,
        senderId: m.sender_id,
        body: m.body,
        imagePath: m.image_path,
        imageUrl: m.image_path ? (urls.get(m.image_path) ?? null) : null,
        createdAt: m.created_at,
        removed: Boolean(m.removed_at),
      }),
    ),
  };
}
