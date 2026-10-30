import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECURITY_SEVERITY } from "../constants";
import type { SecurityFinding } from "../queries";

const ORDER: Record<string, number> = { critical: 0, high: 1, info: 2 };

export function SecurityReport({ findings }: { findings: SecurityFinding[] }) {
  const sorted = [...findings].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
  const problems = sorted.filter((f) => f.severity !== "info");

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4",
          problems.length ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
        )}
      >
        {problems.length ? <ShieldAlert className="mt-0.5 size-6 shrink-0 text-red-600" /> : <ShieldCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" />}
        <div>
          <p className="font-bold">{problems.length ? `Phát hiện ${problems.length} vấn đề cần xử lý` : "Không phát hiện lỗ hổng cấu hình"}</p>
          <p className="text-sm text-muted-foreground">
            Kiểm tra trực tiếp trên database: RLS trên mọi bảng, quyền của khách chưa đăng nhập (anon), hàm SECURITY DEFINER, policy mở rộng,
            kho lưu trữ công khai. Kiểm tra cách ly dữ liệu theo từng phụ huynh / giáo viên: chạy file <code>supabase/tests/rls-isolation.sql</code>.
          </p>
        </div>
      </div>
      {sorted.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card">
          {sorted.map((f, i) => {
            const sev = SECURITY_SEVERITY[f.severity as keyof typeof SECURITY_SEVERITY] ?? SECURITY_SEVERITY.info;
            return (
              <li key={`${f.objectName}-${i}`} className="flex flex-wrap items-start gap-2 p-3 text-sm">
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", sev.className)}>{sev.label}</span>
                <code className="break-all font-semibold">{f.objectName}</code>
                <span className="w-full text-muted-foreground">{f.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
