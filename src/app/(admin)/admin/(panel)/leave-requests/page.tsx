import type { Metadata } from "next";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";
import { LeaveReviewScreen } from "@/features/leave/screens/leave-review-screen";

export const metadata: Metadata = { title: "Đơn xin nghỉ học" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AdminFeedMarkRead category="leave" />
      <LeaveReviewScreen params={await searchParams} basePath="/admin/leave-requests" />
    </>
  );
}
