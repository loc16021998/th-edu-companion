import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import { listMyTrials } from "@/features/admissions/queries";
import { TeacherTrials } from "@/features/admissions/components/teacher-trials";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Học thử" };

export default async function TeacherTrialsPage() {
  await requireRole("teacher");
  const trials = await listMyTrials();

  return (
    <div className="space-y-5">
      {/* Đã mở trang → thông báo "lịch học thử" không còn hiện là mới */}
      <MarkNotificationsRead types={["trial_assigned"]} />
      <div>
        <h1 className="text-xl font-extrabold">Lớp học trải nghiệm</h1>
        <p className="text-sm text-muted-foreground">Bé được xếp học thử với cô. Sau buổi học, cô đánh giá nhanh để tư vấn viên trao đổi với phụ huynh.</p>
      </div>
      {trials.available ? (
        <TeacherTrials trials={trials.items} now={Date.now()} today={todayVN()} />
      ) : (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Chức năng học thử đang được nhà trường cập nhật.</p>
      )}
    </div>
  );
}
