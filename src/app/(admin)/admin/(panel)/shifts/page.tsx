import type { Metadata } from "next";
import { listShifts } from "@/features/shifts/queries";
import { ShiftManager } from "@/features/shifts/components/shift-manager";

export const metadata: Metadata = { title: "Ca học" };

export default async function AdminShiftsPage() {
  const shifts = await listShifts();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Ca học</h1>
        <p className="text-sm text-muted-foreground">Tạo ca (giờ học + ngày trong tuần) rồi gán cho lớp ở trang Lớp học. Chỉ quản trị viên được tạo / sửa.</p>
      </div>
      {shifts.available ? (
        <ShiftManager shifts={shifts.items} />
      ) : (
        <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
          <p className="font-bold">Database chưa có bảng ca học</p>
          <p className="text-muted-foreground">
            Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file{" "}
            <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-class-shifts.sql</span> rồi bấm Run, sau đó tải lại
            trang.
          </p>
        </div>
      )}
    </div>
  );
}
