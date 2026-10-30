import "server-only";
import { requireRole } from "@/features/auth/queries";
import { getChatInbox, openConversation } from "../queries";
import { ChatScreen } from "../components/chat-screen";

/** Kênh chat nhanh phụ huynh ↔ giáo viên phụ trách lớp. `?with=<id người kia>` mở cuộc trò chuyện. */
export async function ChatPage({ params, basePath }: { params: Record<string, string | string[] | undefined>; basePath: string }) {
  const profile = await requireRole("parent", "teacher");
  const inbox = await getChatInbox(profile);

  if (!inbox.available) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">Nhắn tin</h1>
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Tính năng nhắn tin đang được cài đặt — nhờ quản trị viên chạy file <code>supabase/apply-leave-chat-push.sql</code>.
        </p>
      </div>
    );
  }

  // Chỉ mở được cuộc trò chuyện với người trong danh bạ hợp lệ (đúng lớp phụ trách)
  const contact = inbox.contacts.find((c) => c.id === params.with) ?? null;
  const opened = contact ? await openConversation(profile, contact) : null;

  return (
    <div className="space-y-3">
      <h1 className="sr-only">Nhắn tin</h1>
      <ChatScreen
        me={profile.id}
        contacts={inbox.contacts}
        active={contact && opened ? { contact, conversationId: opened.conversationId, messages: opened.messages, otherReadAt: opened.otherReadAt } : null}
        basePath={basePath}
      />
    </div>
  );
}
