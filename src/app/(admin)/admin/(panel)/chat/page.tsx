import type { Metadata } from "next";
import { Clock, MessageCircle, MessagesSquare } from "lucide-react";
import { requireRole } from "@/features/auth/queries";
import { getAdminChatOverview, getAdminTranscript } from "@/features/chat/admin-queries";
import { AdminChatConsole } from "@/features/chat/components/admin-chat-console";

export const metadata: Metadata = { title: "Nhắn tin phụ huynh – giáo viên" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminChatPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireRole("admin");
  const { available, conversations, stats } = await getAdminChatOverview();
  const conversation = conversations.find((c) => c.id === params.c) ?? null;
  const messages = conversation ? await getAdminTranscript(conversation.id) : [];

  const tiles = [
    { label: "Cuộc trò chuyện", value: stats.conversations, icon: MessagesSquare, tone: "bg-sky-100 text-sky-700" },
    { label: "Tin nhắn 7 ngày qua", value: stats.messages7d, icon: MessageCircle, tone: "bg-emerald-100 text-emerald-700" },
    { label: "Phụ huynh chờ cô trả lời", value: stats.awaiting, icon: Clock, tone: "bg-amber-100 text-amber-700" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Nhắn tin phụ huynh – giáo viên</h1>
        <p className="text-sm text-muted-foreground">Theo dõi, trả lời thay mặt trung tâm, nhắc giáo viên phản hồi kịp thời và gỡ tin nhắn không phù hợp.</p>
      </div>
      {!available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có kênh chat — chạy file <code>supabase/apply-leave-chat-push.sql</code> (và <code>apply-chat-moderation.sql</code>).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {tiles.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
                <span className={`hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex ${tone}`}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-extrabold tabular-nums leading-none">{value}</p>
                  <p className="mt-1 text-xs font-semibold leading-tight text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <AdminChatConsole me={profile.id} conversations={conversations} active={conversation ? { conversation, messages } : null} />
        </>
      )}
    </div>
  );
}
