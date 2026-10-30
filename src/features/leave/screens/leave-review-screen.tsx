import "server-only";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { RealtimeRefresh } from "@/components/shared/realtime-refresh";
import { listLeaveForStaff } from "../queries";
import { LeaveReviewCard } from "../components/leave-review";

/** Duyệt đơn xin nghỉ — giáo viên (học sinh lớp mình, theo RLS) và quản trị (mọi đơn). */
export async function LeaveReviewScreen({ params, basePath }: { params: Record<string, string | string[] | undefined>; basePath: string }) {
  const view = params.view === "done" ? "done" : "pending";
  const [pending, list] = await Promise.all([listLeaveForStaff("pending"), view === "done" ? listLeaveForStaff("done") : null]);
  const items = view === "done" ? (list?.items ?? []) : pending.items;
  const pill = (active: boolean) => cn("rounded-full px-3.5 py-2 text-sm font-semibold ring-1", active ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Đơn xin nghỉ học</h1>
        <p className="text-sm text-muted-foreground">Bấm “Đồng ý” → điểm danh các ngày đó tự ghi “Nghỉ có phép” và phụ huynh nhận thông báo ngay.</p>
      </div>
      {!pending.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có bảng đơn xin nghỉ — chạy file <code>supabase/apply-leave-chat-push.sql</code>.
        </p>
      ) : (
        <>
          <RealtimeRefresh table="leave_requests" channel={`leave-review:${basePath}`} notice="Có đơn xin nghỉ mới từ phụ huynh" />
          <nav className="flex gap-2">
            <Link href={basePath} className={pill(view === "pending")}>
              Chờ xác nhận ({pending.items.length})
            </Link>
            <Link href={`${basePath}?view=done`} className={pill(view === "done")}>
              Đã xử lý
            </Link>
          </nav>
          {items.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
              <CalendarCheck className="size-10 text-muted-foreground" />
              <p className="mt-2 font-semibold">{view === "pending" ? "Không có đơn nào chờ xác nhận" : "Chưa xử lý đơn nào"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Đơn mới của phụ huynh sẽ hiện ngay tại đây.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <LeaveReviewCard key={`${item.id}-${item.status}`} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
