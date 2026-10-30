import { Suspense } from "react";
import { requireRole } from "@/features/auth/queries";
import { TeacherNav, TeacherSidebar } from "@/features/teacher/components/teacher-nav";
import { FloatingContact } from "@/features/parent-chat/components/floating-contact";
import { LiveCountsProvider } from "@/features/realtime/live-counts";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("teacher");

  return (
    // Huy hiệu tin chưa đọc + đơn xin nghỉ chờ duyệt (realtime) — 1 kết nối dùng chung cho menu dọc + thanh đáy
    <LiveCountsProvider userId={profile.id} role="teacher">
      <div className="mx-auto flex max-w-6xl md:gap-6">
        {/* Máy tính / máy tính bảng: menu dọc bên trái (giống khu phụ huynh & quản trị), dính khi cuộn */}
        <aside className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+1.5rem)] hidden max-h-[calc(100dvh-5.5rem)] w-60 shrink-0 self-start overflow-y-auto md:block print:hidden">
          {/* useSearchParams cần Suspense boundary */}
          <Suspense fallback={null}>
            <TeacherSidebar />
          </Suspense>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
        {/* Điện thoại: thanh tab đáy + nút "Menu" (khoảng trống chừa ở footer — layout cha) */}
        <div className="md:hidden">
          <Suspense fallback={null}>
            <TeacherNav />
          </Suspense>
        </div>
        {/* Chat với tư vấn viên (trả lời tự động, hướng dẫn thao tác) + Chat Zalo.
            raised: trang điểm danh / sổ liên lạc có thanh "Lưu" dính đáy → nút nằm cao hơn để không che. */}
        <FloatingContact mode="teacher" storageKey={`th-edu:teacher-chat:${profile.id}`} aboveTabBar raised />
      </div>
    </LiveCountsProvider>
  );
}
