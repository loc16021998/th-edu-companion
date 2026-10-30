import type { Metadata } from "next";
import { requireRole } from "@/features/auth/queries";
import { getAdminFeed } from "@/features/admin-feed/queries";
import { FEED_FILTERS, type FeedFilter } from "@/features/admin-feed/constants";
import { AdminFeedList } from "@/features/admin-feed/components/admin-feed-list";

export const metadata: Metadata = { title: "Thông báo hoạt động" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminNotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireRole("admin");
  const filter: FeedFilter = FEED_FILTERS.includes(params.f as FeedFilter) ? (params.f as FeedFilter) : "all";
  const feed = await getAdminFeed(profile.id, filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Thông báo hoạt động</h1>
        <p className="text-sm text-muted-foreground">
          Mọi hoạt động của phụ huynh và giáo viên: phản hồi, đơn xin nghỉ, tin nhắn, bài tập, sổ liên lạc, điểm danh, tổng kết tháng — cập nhật tức thì.
        </p>
      </div>
      {!feed.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có bảng thông báo cho quản trị — chạy file <code>supabase/apply-admin-activity-feed.sql</code> trong Supabase SQL Editor.
        </p>
      ) : (
        <AdminFeedList key={filter} items={feed.items} filter={filter} />
      )}
    </div>
  );
}
