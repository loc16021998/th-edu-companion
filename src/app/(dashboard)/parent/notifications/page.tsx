import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import { listNotifications } from "@/features/notifications/queries";
import { notificationHref, relativeTime } from "@/features/notifications/format";
import { NotificationList, type NotificationItem } from "@/features/notifications/components/notification-list";
import { EmptyState } from "@/features/parent/components/section";
import { PushOptIn } from "@/features/push/components/push-opt-in";

export const metadata: Metadata = { title: "Bản tin" };

export default async function ParentNotificationsPage() {
  const profile = await requireRole("parent");
  const notifications = await listNotifications(profile.id);

  const today = todayVN();
  const now = new Date();
  const items: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.read_at !== null,
    href: notificationHref(n, today),
    time: relativeTime(n.created_at, now),
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Bản tin</h1>
      {/* Bật thông báo đẩy trên điện thoại (ẩn khi đã bật / không hỗ trợ) */}
      <PushOptIn compact />
      {items.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title="Chưa có thông báo nào"
          description="Khi giáo viên điểm danh hoặc viết sổ liên lạc cho con, thông báo sẽ xuất hiện tại đây."
        />
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  );
}
