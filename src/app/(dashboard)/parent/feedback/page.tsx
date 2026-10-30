import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { givenName } from "@/lib/utils";
import { requireRole } from "@/features/auth/queries";
import { listMyFeedback } from "@/features/feedback/queries";
import { FeedbackForm } from "@/features/feedback/components/feedback-form";
import { FeedbackHistory } from "@/features/feedback/components/feedback-history";
import { MarkRepliesRead } from "@/features/feedback/components/mark-replies-read";
import { listStudents } from "@/features/students/queries";

export const metadata: Metadata = { title: "Góp ý & hỗ trợ" };

/** SĐT hồ sơ (+84…) → dạng quen thuộc 0912… để điền sẵn ô liên hệ */
function localPhone(phone: string | null) {
  return phone ? phone.replace(/^\+?84/, "0") : "";
}

export default async function ParentFeedbackPage() {
  const profile = await requireRole("parent");
  const [students, feedback] = await Promise.all([listStudents(), listMyFeedback()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Góp ý & hỗ trợ</h1>
        <p className="text-sm text-muted-foreground">
          Góp ý, báo lỗi hoặc thắc mắc gửi thẳng tới Ban Giám đốc TH EDU — có thể gửi ẩn danh. Mỗi ý kiến đều được đọc và phản hồi.
        </p>
      </div>

      {feedback.available ? (
        <>
          {feedback.items.some((f) => f.admin_reply || f.status !== "new") && <MarkRepliesRead />}
          <FeedbackForm
            students={students.map((s) => ({ id: s.id, name: givenName(s.full_name) }))}
            contact={{ name: profile.full_name, phone: localPhone(profile.phone) }}
          />
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <MessagesSquare className="size-5 text-primary" /> Ý kiến đã gửi
            </h2>
            <FeedbackHistory items={feedback.items} />
          </section>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chức năng góp ý đang được nhà trường cập nhật. Anh/chị vui lòng quay lại sau.
        </p>
      )}
    </div>
  );
}
