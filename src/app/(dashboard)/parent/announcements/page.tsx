import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { listParentAnnouncements } from "@/features/center/queries";
import { ANNOUNCEMENT_CATEGORIES, type AnnouncementCategory } from "@/features/center/constants";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Thông báo từ trung tâm" };

const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full", timeStyle: "short" });

export default async function ParentAnnouncementsPage() {
  const { available, items } = await listParentAnnouncements();

  return (
    <div className="space-y-4">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["announcement"]} />
      <div>
        <h1 className="text-xl font-extrabold">Thông báo từ trung tâm</h1>
        <p className="text-sm text-muted-foreground">Lịch nghỉ lễ, cuộc thi, chương trình ngoại khoá của TH EDU.</p>
      </div>
      {!available || items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
          <Megaphone className="size-10 text-muted-foreground" />
          <p className="mt-2 font-semibold">Chưa có thông báo nào</p>
          <p className="mt-1 text-sm text-muted-foreground">Khi trung tâm đăng thông báo, bố mẹ sẽ nhận được ngay trên chuông.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const cat = ANNOUNCEMENT_CATEGORIES[a.category as AnnouncementCategory] ?? ANNOUNCEMENT_CATEGORIES.general;
            return (
              <li key={a.id} id={`a-${a.id}`} className="scroll-mt-20 space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border target:ring-2 target:ring-primary">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={cn("rounded-full px-2 py-0.5 ring-1", cat.badge)}>{cat.label}</span>
                  <span className="text-muted-foreground first-letter:uppercase">{timeFmt.format(new Date(a.createdAt))}</span>
                </div>
                <h2 className="font-bold leading-snug">{a.title}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed">{a.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
