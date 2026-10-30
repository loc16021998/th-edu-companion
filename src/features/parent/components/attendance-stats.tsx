import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database.types";
import { ATTENDANCE_STYLE } from "@/config/ui-styles";
import { countAttendance } from "@/config/constants";

/**
 * Tỉ lệ chuyên cần (1 hàng, thanh tiến độ) + 4 ô trạng thái. Chữ ≥ 14px nên không xếp 5 ô cùng hàng trên điện thoại
 * (nhãn "Nghỉ có phép" sẽ vỡ 3 dòng).
 */
export function AttendanceStats({ records }: { records: Tables<"attendance">[] }) {
  const count = countAttendance(records.map((r) => r.status));
  // Nghỉ có phép (đơn xin nghỉ được duyệt) không tính vào tỷ lệ chuyên cần
  const total = records.length - count.absent_with_permission;
  const rate = total ? Math.round(((count.present + count.late) / total) * 100) : null;

  const items = (["present", "late", "absent", "absent_with_permission"] as const).map((k) => ({ key: k, ...ATTENDANCE_STYLE[k], value: count[k] }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-edu-leaf-100 to-green-50 p-3 shadow-sm ring-1 ring-green-200">
        <span className="text-2xl font-extrabold tabular-nums text-green-800">{rate === null ? "–" : `${rate}%`}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-green-800">Tỉ lệ chuyên cần</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-valuenow={rate ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ chuyên cần">
            <div className="h-full rounded-full bg-gradient-to-r from-edu-leaf to-green-500" style={{ width: `${rate ?? 0}%` }} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ key, label, card, value }) => (
          <div key={key} className={cn("flex flex-col items-center justify-center rounded-2xl p-2 shadow-neu ring-1", card)}>
            <span className="text-xl font-extrabold tabular-nums">{value}</span>
            <span className="text-center text-xs font-semibold leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
