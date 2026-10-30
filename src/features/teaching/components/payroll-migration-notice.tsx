/** Database chưa chạy apply-teaching-payroll.sql. */
export function PayrollMigrationNotice() {
  return (
    <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
      <p className="font-bold">Database chưa có bảng chấm công theo ca</p>
      <p className="text-muted-foreground">
        Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file{" "}
        <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-teaching-payroll.sql</span> rồi bấm Run, sau đó tải lại trang.
      </p>
    </div>
  );
}
