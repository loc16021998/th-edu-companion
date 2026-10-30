/** Database chưa chạy apply-admissions.sql. */
export function AdmissionsMigrationNotice() {
  return (
    <div className="space-y-2 rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-amber-200">
      <p className="font-bold">Database chưa có bảng tuyển sinh</p>
      <p className="text-muted-foreground">
        Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file{" "}
        <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-admissions.sql</span> rồi bấm Run, sau đó tải lại trang.
      </p>
    </div>
  );
}
