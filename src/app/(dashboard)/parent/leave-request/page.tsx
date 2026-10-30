import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { givenName } from "@/lib/utils";
import { RealtimeRefresh } from "@/components/shared/realtime-refresh";
import { getSelectedChild } from "@/features/parent/children";
import { NoChildren } from "@/features/parent/components/no-children";
import { listLeaveForStudent } from "@/features/leave/queries";
import { LeaveRequestForm, ParentLeaveList } from "@/features/leave/components/leave-request-form";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Xin nghỉ học" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentLeavePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;
  const { available, items } = await listLeaveForStudent(child.id);
  const name = givenName(child.full_name);

  return (
    <div className="space-y-4">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["leave_decided"]} studentId={child.id} />
      <div>
        <h1 className="text-xl font-extrabold">Xin nghỉ học</h1>
        <p className="text-sm text-muted-foreground">Gửi đơn cho cô chủ nhiệm — ngày được đồng ý sẽ ghi là “Nghỉ có phép”, không tính vắng không phép.</p>
      </div>
      {!available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Tính năng xin nghỉ đang được trung tâm cài đặt. Bố mẹ vui lòng liên hệ cô chủ nhiệm qua điện thoại.
        </p>
      ) : (
        <>
          {/* Cô duyệt đơn → trang tự cập nhật */}
          <RealtimeRefresh table="leave_requests" filter={`student_id=eq.${child.id}`} channel={`leave:${child.id}`} />
          <LeaveRequestForm key={child.id} studentId={child.id} childName={name} today={todayVN()} />
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Đơn đã gửi</h2>
            <ParentLeaveList items={items} />
          </section>
        </>
      )}
    </div>
  );
}
