import { Badge } from "@/components/ui/badge";
import { cn, formatVND } from "@/lib/utils";
import { fullDate } from "@/lib/date";
import type { Tables } from "@/types/database.types";
import { FEE_STATUS_STYLE, feeIcon } from "@/config/ui-styles";
import { PayNow, type PayInfo } from "@/features/finance/components/pay-now";

type Fee = Pick<Tables<"fees">, "id" | "title" | "amount" | "paid_amount" | "status" | "due_date" | "created_at"> & { period?: string | null };

/** Thông tin để tạo VietQR (null = không hiện nút thanh toán). */
export type FeePayContext = { student: { code: string | null; name: string }; pay: PayInfo | null } | null;

function FeeItem({ fee, today, payContext, autoPay = false }: { fee: Fee; today: string; payContext: FeePayContext; autoPay?: boolean }) {
  const { icon: Icon, bubble } = feeIcon(fee.title);
  const overdue = fee.status !== "paid" && !!fee.due_date && fee.due_date < today;
  const remaining = fee.amount - fee.paid_amount;
  const status = FEE_STATUS_STYLE[fee.status];

  return (
    <li id={`fee-${fee.id}`} className="flex scroll-mt-24 gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border target:ring-2 target:ring-primary">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", bubble)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold leading-snug">{fee.title}</p>
          <p className="shrink-0 font-extrabold tabular-nums">{formatVND(fee.amount)}</p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="soft" className={status.badge}>
            {status.label}
          </Badge>
          {overdue && (
            <Badge variant="soft" className="bg-rose-600 text-white ring-rose-600">
              Quá hạn
            </Badge>
          )}
          {fee.due_date && (
            <span className={cn("text-xs font-medium", overdue ? "text-rose-600" : "text-muted-foreground")}>
              Hạn {fullDate(fee.due_date)}
            </span>
          )}
        </div>

        {payContext && fee.status !== "paid" && remaining > 0 && (
          <PayNow
            fee={{ title: fee.title, remaining, month: fee.period ?? (fee.due_date ? `${fee.due_date.slice(0, 7)}-01` : `${fee.created_at.slice(0, 7)}-01`) }}
            student={payContext.student}
            pay={payContext.pay}
            autoOpen={autoPay}
          />
        )}
        {fee.status === "partial" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Đã đóng <span className="font-semibold text-emerald-700">{formatVND(fee.paid_amount)}</span> · Còn thiếu{" "}
            <span className="font-semibold text-amber-700">{formatVND(remaining)}</span>
          </p>
        )}
      </div>
    </li>
  );
}

/** Khoản chưa xong lên trước (hạn gần nhất trước), khoản đã thanh toán xuống dưới. */
/** `payFeeId`: mở từ thông báo học phí → khoản đó tự hiện mã QR thanh toán. */
export function FeeList({ fees, today, payContext = null, payFeeId = null }: { fees: Fee[]; today: string; payContext?: FeePayContext; payFeeId?: string | null }) {
  const byDue = (a: Fee, b: Fee) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const open = fees.filter((f) => f.status !== "paid").sort(byDue);
  const paid = fees.filter((f) => f.status === "paid").sort((a, b) => byDue(b, a));

  return (
    <div className="space-y-5">
      {open.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-muted-foreground">Cần thanh toán ({open.length})</h3>
          <ul className="space-y-2.5">
            {open.map((f) => (
              <FeeItem key={f.id} fee={f} today={today} payContext={payContext} autoPay={f.id === payFeeId} />
            ))}
          </ul>
        </div>
      )}
      {paid.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-muted-foreground">Đã thanh toán ({paid.length})</h3>
          <ul className="space-y-2.5">
            {paid.map((f) => (
              <FeeItem key={f.id} fee={f} today={today} payContext={null} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
