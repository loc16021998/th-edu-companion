import { PayrollTabs } from "@/features/teaching/components/payroll-tabs";

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Lương giáo viên</h1>
        <p className="text-sm text-muted-foreground">
          Tự động tính theo ca dạy thực tế (giáo viên bấm bắt đầu / kết thúc ca trên app) × đơn giá buổi theo môn.
        </p>
      </div>
      <PayrollTabs />
      {children}
    </div>
  );
}
