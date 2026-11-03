import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { listKnowledge } from "@/features/parent-chat/knowledge";
import { KnowledgeAdmin } from "@/features/parent-chat/components/knowledge-admin";

export const metadata: Metadata = { title: "Kho kiến thức Trợ lý AI" };

export default async function KnowledgeAdminPage() {
  await connection();
  await requireRole("admin");
  const { available, items } = await listKnowledge();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Kho kiến thức Trợ lý AI</h1>
        <p className="text-sm text-muted-foreground">
          Quy chế, học phí, lịch & sự kiện, tài liệu sư phạm của trung tâm. Trợ lý AI hỏi – đáp của phụ huynh chỉ trả lời quy định theo các bài ĐANG BẬT ở
          đây (cùng dữ liệu riêng của con và Thông báo trung tâm) — quy định chưa có trong kho, trợ lý sẽ mời phụ huynh kết nối Quản lý cơ sở.
        </p>
      </div>
      {available ? (
        <KnowledgeAdmin items={items} />
      ) : (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa cài đặt Kho kiến thức — chạy file <code>supabase/apply-knowledge-base.sql</code> trong Supabase SQL Editor.
        </p>
      )}
    </div>
  );
}
