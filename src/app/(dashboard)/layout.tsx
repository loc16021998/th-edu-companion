import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shared/app-header";
import { InstallPrompt } from "@/components/shared/install-prompt";
import { PageWatermark } from "@/components/shared/page-watermark";
import { SiteFooter } from "@/components/shared/site-footer";
import { StalePageRefresh } from "@/components/shared/stale-page-refresh";
import { getAuthContext } from "@/features/auth/queries";
import { countUnreadNotifications } from "@/features/notifications/queries";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getSelectedChild } from "@/features/parent/children";
import { SelectedStudentProvider } from "@/features/parent/components/selected-student";
import { LOGIN_PATH } from "@/lib/auth/routes";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${LOGIN_PATH}?error=session_expired`);

  // Chuông thông báo: phụ huynh (điểm danh, sổ liên lạc, bài tập…) và giáo viên (đơn xin nghỉ…)
  const role = ctx.profile.role;
  const hasBell = role === "parent" || role === "teacher";
  const [unread, family] = await Promise.all([
    hasBell ? countUnreadNotifications(ctx.profile.id) : 0,
    // Phụ huynh: các con (từ cache) + bé đã chọn lần trước (cookie) cho bộ chọn bé dùng chung toàn khu
    role === "parent" ? getSelectedChild(undefined) : null,
  ]);
  const kids = (family?.students ?? []).map((s) => ({ id: s.id, full_name: s.full_name, avatar_url: s.avatar_url, class_name: s.class_name, campus: s.campus }));

  const page = (
    // isolate: tạo lớp xếp chồng riêng để nền logo (-z-10) nằm trên màu nền nhưng dưới mọi nội dung
    <div className="isolate min-h-dvh bg-background">
      <PageWatermark />
      <AppHeader
        profile={ctx.profile}
        kids={kids}
        actions={
          hasBell ? (
            <NotificationBell userId={ctx.profile.id} initialUnread={unread} href={role === "teacher" ? "/teacher/notifications" : "/parent/notifications"} />
          ) : undefined
        }
      />
      {/* Luôn cao ≥ màn hình → footer nằm dưới mép màn hình cả lúc skeleton lẫn lúc có nội dung (không nhảy bố cục) */}
      <main className="container min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] py-6">{children}</main>
      {/* Mở từ bản đã lưu (service worker) → tự lấy dữ liệu mới nhất */}
      <StalePageRefresh />
      {/* Nhắc "Thêm vào màn hình chính" (Safari iOS / Chrome Android) */}
      <InstallPrompt role={role === "teacher" ? "teacher" : "parent"} />
      {/* Mobile: chừa chỗ cho thanh tab cố định ở đáy */}
      <SiteFooter className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6" />
    </div>
  );

  // Phụ huynh: "bé đang xem" dùng chung cho header, mọi trang, lời chào (SelectedStudentContext)
  return role === "parent" ? (
    <SelectedStudentProvider students={kids} initialId={family?.child?.id ?? null}>
      {page}
    </SelectedStudentProvider>
  ) : (
    page
  );
}
