import type { Metadata } from "next";
import { Info } from "lucide-react";
import { todayVN } from "@/lib/date";
import { listFees } from "@/features/fees/queries";
import { getPaymentConfig, getStudentCode } from "@/features/finance/queries";
import { getSelectedChild } from "@/features/parent/children";
import { FeeList } from "@/features/parent/components/fee-list";
import { FeeSummary, summarizeFees } from "@/features/parent/components/fee-summary";
import { NoChildren } from "@/features/parent/components/no-children";
import { EmptyState } from "@/features/parent/components/section";
import { MarkNotificationsRead } from "@/features/notifications/components/mark-read";

export const metadata: Metadata = { title: "Học phí" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentFeesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { child } = await getSelectedChild(params.child);
  if (!child) return <NoChildren />;

  const today = todayVN();
  const [fees, pay, code] = await Promise.all([listFees(child.id), getPaymentConfig(), getStudentCode(child.id)]);

  return (
    <div className="space-y-5">
      {/* Đã mở trang → thông báo liên quan không còn hiện là mới */}
      <MarkNotificationsRead types={["fee_issued", "fee_reminder", "fee_paid"]} studentId={child.id} />
      <h1 className="text-xl font-extrabold">Học phí</h1>


      {fees.length === 0 ? (
        <EmptyState emoji="🎉" title="Chưa có khoản thu nào" description="Các khoản học phí sẽ hiển thị tại đây khi nhà trường phát hành." />
      ) : (
        <>
          <FeeSummary summary={summarizeFees(fees, today)} />
          <FeeList fees={fees} today={today} payContext={{ student: { code, name: child.full_name }, pay }} />
          <p className="flex gap-2 rounded-2xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-800 ring-1 ring-sky-100">
            <Info className="mt-0.5 size-4 shrink-0" />
            Bấm “Thanh toán ngay” để quét mã VietQR (đã điền sẵn số tiền và nội dung). Sau khi chuyển khoản, trạng thái sẽ được cập nhật khi nhà trường xác nhận. Mọi thắc mắc vui lòng liên hệ văn
            phòng cơ sở của bé.
          </p>
        </>
      )}
    </div>
  );
}
