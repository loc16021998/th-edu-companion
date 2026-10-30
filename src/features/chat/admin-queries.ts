import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";
import { CHAT_BUCKET, fetchMessages } from "./queries";

// Quản trị viên đọc mọi cuộc trò chuyện nhờ policy chat_*_select (is_admin).

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
}

export type AdminConversation = {
  id: string;
  parent: { id: string; name: string; phone: string | null };
  teacher: { id: string; name: string; phone: string | null };
  children: { name: string; className: string; campus: Enums<"campus"> }[];
  lastMessageAt: string | null;
  preview: string | null;
  /** Tin cuối do phụ huynh gửi → đang chờ cô trả lời */
  awaitingTeacher: boolean;
};

export async function getAdminChatOverview(): Promise<{
  available: boolean;
  conversations: AdminConversation[];
  stats: { conversations: number; messages7d: number; awaiting: number };
}> {
  const supabase = await createClient();
  const [convRes, countRes] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select(
        "id, parent_id, teacher_id, last_message_at, last_message_preview, last_sender_id, parent:profiles!chat_conversations_parent_id_fkey(id, full_name, phone), teacher:profiles!chat_conversations_teacher_id_fkey(id, full_name, phone)",
      )
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(500),
    supabase.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  if (convRes.error) {
    if (isMissing(convRes.error.code)) return { available: false, conversations: [], stats: { conversations: 0, messages7d: 0, awaiting: 0 } };
    throw new Error("Không tải được danh sách trò chuyện", { cause: convRes.error });
  }

  const parentIds = [...new Set(convRes.data.map((c) => c.parent_id))];
  const { data: students } = parentIds.length
    ? await supabase.from("students").select("full_name, class_name, campus, parent_id").in("parent_id", parentIds)
    : { data: [] };

  const conversations: AdminConversation[] = convRes.data.map((c) => ({
    id: c.id,
    parent: { id: c.parent_id, name: c.parent?.full_name || "Phụ huynh", phone: c.parent?.phone ?? null },
    teacher: { id: c.teacher_id, name: c.teacher?.full_name || "Giáo viên", phone: c.teacher?.phone ?? null },
    children: (students ?? []).filter((s) => s.parent_id === c.parent_id).map((s) => ({ name: s.full_name, className: s.class_name, campus: s.campus })),
    lastMessageAt: c.last_message_at,
    preview: c.last_message_preview,
    awaitingTeacher: c.last_sender_id === c.parent_id,
  }));

  return {
    available: true,
    conversations,
    stats: { conversations: conversations.length, messages7d: countRes.count ?? 0, awaiting: conversations.filter((c) => c.awaitingTeacher).length },
  };
}

export type AdminMessage = {
  id: string;
  senderId: string;
  body: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  createdAt: string;
  removedAt: string | null;
};

/** Toàn bộ nội dung 1 cuộc trò chuyện (300 tin gần nhất) cho quản trị viên. */
export async function getAdminTranscript(conversationId: string): Promise<AdminMessage[]> {
  const supabase = await createClient();
  const rows = await fetchMessages(supabase, conversationId, 300);
  const paths = rows.flatMap((m) => (m.image_path ? [m.image_path] : []));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const d of signed ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  }
  return rows.map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    body: m.body,
    imagePath: m.image_path,
    imageUrl: m.image_path ? (urls.get(m.image_path) ?? null) : null,
    createdAt: m.created_at,
    removedAt: m.removed_at ?? null,
  }));
}
