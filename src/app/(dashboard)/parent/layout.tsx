import { Suspense } from "react";
import { requireRole } from "@/features/auth/queries";
import {
  ParentNav,
  ParentSectionTabs,
  ParentSidebar,
} from "@/features/parent/components/parent-nav";
import { FloatingContact } from "@/features/parent-chat/components/floating-contact";
import { SwitchingArea } from "@/features/parent/components/selected-student";
import { LiveCountsProvider } from "@/features/realtime/live-counts";
import { getSelectedChild } from "@/features/parent/children";
import { getSurveyPrompt } from "@/features/surveys/queries";
import { SatisfactionSurvey } from "@/features/surveys/components/satisfaction-survey";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("parent");
  // Khảo sát hài lòng cuối tháng: chỉ truy vấn trong đợt khảo sát (danh sách con đọc từ cache)
  const { students } = await getSelectedChild(undefined);
  const survey = await getSurveyPrompt(profile.id, students).catch(() => null);

  return (
    // Số tin chat chưa đọc trên menu — 1 kết nối realtime dùng chung cho menu dọc + thanh đáy
    <LiveCountsProvider userId={profile.id} role="parent">
      <div className="mx-auto flex max-w-5xl md:gap-6">
        {/* Máy tính / máy tính bảng: menu dọc bên trái (giống khu quản trị), dính khi cuộn */}
        <aside className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+1.5rem)] hidden max-h-[calc(100dvh-5.5rem)] w-60 shrink-0 self-start overflow-y-auto md:block print:hidden">
          {/* useSearchParams cần Suspense boundary */}
          <Suspense fallback={null}>
            <ParentSidebar />
          </Suspense>
        </aside>
        <div className="mx-auto min-w-0 max-w-2xl flex-1 md:mx-0 md:max-w-3xl">
          {/* Điện thoại: thanh mục con của nhóm Học tập (Tiến độ · Bài tập · Chuyên cần · Lịch học) */}
          <Suspense fallback={null}>
            <ParentSectionTabs />
          </Suspense>
          {/* Đang đổi bé → giữ nội dung cũ, làm mờ nhẹ tới khi dữ liệu bé mới về (không nhảy bố cục) */}
          <SwitchingArea>{children}</SwitchingArea>
        </div>
        {/* Điện thoại: thanh tab đáy (khoảng trống chừa ở footer — layout cha) */}
        <div className="md:hidden">
          <Suspense fallback={null}>
            <ParentNav />
          </Suspense>
        </div>
        {/* Chat với tư vấn viên (trả lời tự động theo dữ liệu của con) + Chat Zalo */}
        <FloatingContact
          mode="parent"
          storageKey={`th-edu:parent-chat:${profile.id}`}
          aboveTabBar
        />
        {survey && <SatisfactionSurvey prompt={survey} />}
      </div>
    </LiveCountsProvider>
  );
}
