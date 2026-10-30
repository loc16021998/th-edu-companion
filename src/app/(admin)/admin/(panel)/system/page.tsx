import type { Metadata } from "next";
import { runHealthChecks } from "@/lib/monitoring/health";
import { getIntegrityReport, listErrorGroups } from "@/features/monitoring/queries";
import { SystemDashboard } from "@/features/monitoring/components/system-dashboard";

export const metadata: Metadata = { title: "Giám sát hệ thống" };

export default async function SystemPage() {
  const [health, integrity, errors] = await Promise.all([runHealthChecks(), getIntegrityReport(), listErrorGroups(7)]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Giám sát hệ thống</h1>
        <p className="text-sm text-muted-foreground">Trạng thái dịch vụ, lỗi phát sinh ở app phụ huynh / giáo viên / quản trị và kiểm tra toàn vẹn dữ liệu.</p>
      </div>
      <SystemDashboard health={health} integrity={integrity} errors={errors} />
    </div>
  );
}
