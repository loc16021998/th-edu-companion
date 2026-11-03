import type { Metadata } from "next";
import { requireRole } from "@/features/auth/queries";
import { AssistantPage } from "@/features/parent-chat/components/assistant-page";

export const metadata: Metadata = { title: "Trợ lý AI hỏi – đáp" };

export default async function ParentAiAssistantPage() {
  const profile = await requireRole("parent");
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-extrabold">Trợ lý AI hỏi – đáp</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Hỏi về học phí, lịch học, chuyên cần, nhận xét của cô, quy định của trung tâm và cách đồng hành cùng con. Trợ lý đọc dữ liệu của các con và tài
          liệu của trung tâm để trả lời.
        </p>
      </div>
      <AssistantPage storageKey={`th-edu:parent-chat:${profile.id}`} />
    </div>
  );
}
