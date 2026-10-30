import type { Metadata } from "next";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";
import { LeaveReviewScreen } from "@/features/leave/screens/leave-review-screen";

export const metadata: Metadata = { title: "Đơn xin nghỉ học" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      {/* Đã mở trang duyệt đơn → thông báo "đơn xin nghỉ" không còn hiện là mới */}
      <MarkNotificationsRead types={["leave_request"]} />
      <LeaveReviewScreen params={await searchParams} basePath="/teacher/leave-requests" />
    </>
  );
}
