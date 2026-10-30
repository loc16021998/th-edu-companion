import { PageWatermark } from "@/components/shared/page-watermark";
import { SiteFooter } from "@/components/shared/site-footer";
import { requireRole } from "@/features/auth/queries";
import { getMissingTables } from "@/features/admin/queries";
import { countUnreadAdminFeed } from "@/features/admin-feed/queries";
import { AdminHeader } from "@/features/admin/components/admin-header";
import { AdminMobileNav, AdminSidebar } from "@/features/admin/components/admin-nav";
import { SetupRequired } from "@/features/admin/components/setup-required";

/** Khung giao diện riêng của quản trị viên (tách khỏi khung phụ huynh / giáo viên). */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("admin");
  // Database chưa chạy migration mới → hướng dẫn cập nhật thay vì lỗi ở từng trang
  const [missing, unread] = await Promise.all([getMissingTables(), countUnreadAdminFeed(profile.id)]);

  return (
    // Điện thoại có thanh tab đáy → thanh "Lưu" dính đáy tự nằm trên thanh tab (--bottom-nav mặc định 4.5rem)
    <div className="isolate min-h-dvh bg-background">
      {/* Nền logo TH EDU mờ, cố định giữa màn hình, nằm dưới nội dung */}
      <PageWatermark />
      {/* In / xuất PDF báo cáo: chỉ in phần nội dung */}
      <div className="print:hidden">
        <AdminHeader profile={profile} unread={unread} />
      </div>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 md:px-6">
        <aside className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto py-6 md:block print:hidden">
          <AdminSidebar />
        </aside>
        <div className="min-w-0 flex-1">
          {/* Luôn cao ≥ màn hình → footer không bị đẩy trong tầm nhìn khi nội dung về */}
          <main className="min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] py-5 md:py-6">
            {missing.length > 0 ? <SetupRequired missing={missing} /> : children}
          </main>
          {/* Điện thoại: chừa chỗ cho thanh tab cố định ở đáy */}
          <SiteFooter className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6 print:hidden" />
        </div>
      </div>
      <AdminMobileNav />
    </div>
  );
}
