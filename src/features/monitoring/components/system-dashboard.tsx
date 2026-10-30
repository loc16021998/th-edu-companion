"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, CircleAlert, CircleX, Database, HardDrive, KeyRound, Loader2, RefreshCw, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";
import { CATEGORY_LABELS, type ErrorCategory } from "@/lib/monitoring/shared";
import type { HealthCheck, HealthReport } from "@/lib/monitoring/health";
import { relativeTime } from "@/features/notifications/format";
import { cn } from "@/lib/utils";
import { cleanupStorageOrphans, purgeOldErrors } from "../actions";
import type { ErrorGroup } from "../queries";

const CHECKS: { key: keyof HealthReport["checks"]; label: string; icon: typeof Database; hint: string }[] = [
  { key: "database", label: "Cơ sở dữ liệu", icon: Database, hint: "Supabase Postgres + PostgREST" },
  { key: "auth", label: "Đăng nhập", icon: KeyRound, hint: "Supabase Auth" },
  { key: "storage", label: "Lưu trữ ảnh / video", icon: HardDrive, hint: "Supabase Storage" },
  { key: "config", label: "Cấu hình máy chủ", icon: Settings2, hint: "Biến môi trường" },
];

const STATUS_TONE: Record<HealthReport["status"], { label: string; tone: string }> = {
  ok: { label: "Hoạt động bình thường", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  degraded: { label: "Một phần gặp sự cố", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  down: { label: "Ngừng hoạt động", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
};

const SEVERITY: Record<string, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-slate-50 text-slate-600 ring-slate-200",
};

const AREA_LABEL: Record<string, string> = { parent: "Phụ huynh", teacher: "Giáo viên", admin: "Quản trị", auth: "Đăng nhập", public: "Trang chung", api: "API" };

function CheckIcon({ check }: { check: HealthCheck }) {
  if (check.status === "ok") return <CheckCircle2 className="size-5 text-emerald-600" aria-label="Hoạt động" />;
  if (check.status === "skipped") return <CircleAlert className="size-5 text-slate-400" aria-label="Bỏ qua" />;
  return <CircleX className="size-5 text-rose-600" aria-label="Lỗi" />;
}

export function SystemDashboard({
  health,
  integrity,
  errors,
}: {
  health: HealthReport;
  integrity: { available: boolean; items: { check_key: string; severity: string; label: string; total: number }[] };
  errors: { available: boolean; total: number; groups: ErrorGroup[] };
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [working, startWork] = useTransition();
  const [category, setCategory] = useState<"" | ErrorCategory>("");
  const [source, setSource] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const overall = STATUS_TONE[health.status];
  const orphans = integrity.items.find((i) => i.check_key === "storage_orphans")?.total ?? 0;

  const groups = useMemo(() => errors.groups.filter((g) => (!category || g.category === category) && (!source || g.source === source)), [errors.groups, category, source]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of errors.groups) m.set(g.category, (m.get(g.category) ?? 0) + g.count);
    return m;
  }, [errors.groups]);

  const cleanup = () =>
    startWork(async () => {
      if (!(await confirmSheet({ title: `Xoá ${orphans} file mồ côi?`, description: "File ảnh / video của học sinh, khoảnh khắc, hội thoại đã bị xoá khỏi hệ thống. Không hoàn tác được.", confirmLabel: "Xoá file", tone: "danger" }))) return;
      const res = await cleanupStorageOrphans();
      if (res.ok) toast.success(`Đã xoá ${res.data.removed} file`, res.data.remaining ? "Còn file mồ côi — bấm lại để xoá tiếp." : undefined);
      else toast.error("Chưa dọn được", res.error);
    });

  const purge = () =>
    startWork(async () => {
      const res = await purgeOldErrors();
      if (res.ok) toast.success(`Đã xoá ${res.data.deleted} lỗi cũ hơn 90 ngày`);
      else toast.error("Chưa xoá được", res.error);
    });

  return (
    <div className="space-y-6">
      {/* Sức khoẻ hệ thống */}
      <section className="space-y-3" aria-labelledby="health-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="health-heading" className="flex items-center gap-2 text-base font-bold">
            <Activity className="size-5 text-primary" /> Trạng thái dịch vụ
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", overall.tone)}>{overall.label}</span>
          </h2>
          <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Kiểm tra lại
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CHECKS.map(({ key, label, icon: Icon, hint }) => {
            const c = health.checks[key];
            return (
              <div key={key} className={cn("space-y-1 rounded-2xl bg-card p-3 shadow-sm ring-1", c.status === "fail" ? "ring-rose-300" : "ring-border")}>
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <CheckIcon check={c} />
                </div>
                <p className="text-sm font-bold leading-snug">{label}</p>
                <p className="text-xs text-muted-foreground">{c.status === "ok" && key !== "config" ? `${c.latencyMs} ms · ${hint}` : hint}</p>
                {c.error && <p className="break-words text-xs font-medium text-rose-700">{c.error}</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Phiên bản {health.release} · máy chủ chạy {Math.round(health.uptimeSec / 60)} phút · Giám sát 24/7: trỏ UptimeRobot / Better Stack vào{" "}
          <code className="rounded bg-muted px-1">/api/health</code> (200 = ổn, 503 = sự cố).
        </p>
      </section>

      {/* Lỗi ứng dụng */}
      <section className="space-y-3" aria-labelledby="errors-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="errors-heading" className="text-base font-bold">
            Lỗi ứng dụng 7 ngày qua <span className="text-sm font-semibold text-muted-foreground">({errors.total} lần · {errors.groups.length} loại)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as "" | ErrorCategory)} aria-label="Lọc theo loại lỗi" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              <option value="">Mọi loại</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v} {byCategory.get(k) ? `(${byCategory.get(k)})` : ""}
                </option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Lọc theo nơi phát sinh" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              <option value="">Client + Server</option>
              <option value="client">Trình duyệt</option>
              <option value="server">Máy chủ</option>
            </select>
          </div>
        </div>
        {!errors.available ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Chưa có bảng nhật ký lỗi — hãy chạy supabase/apply-monitoring.sql.</p>
        ) : groups.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">
            <ShieldCheck className="size-5 text-emerald-600" /> Không có lỗi nào được ghi nhận.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {groups.map((g) => (
              <li key={g.fingerprint}>
                <button type="button" onClick={() => setOpen(open === g.fingerprint ? null : g.fingerprint)} aria-expanded={open === g.fingerprint} className="block w-full p-3 text-left hover:bg-muted/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 break-words font-mono text-sm font-semibold">{g.message}</p>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-700 ring-1 ring-rose-200">{g.count}×</span>
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{CATEGORY_LABELS[g.category as ErrorCategory] ?? g.category}</span>
                    <span>· {g.source === "client" ? "Trình duyệt" : "Máy chủ"}</span>
                    {g.areas.length > 0 && <span>· {g.areas.map((a) => AREA_LABEL[a] ?? a).join(", ")}</span>}
                    {g.users > 0 && <span>· {g.users} người dùng</span>}
                    <span>· gần nhất {relativeTime(g.lastSeen)}</span>
                  </p>
                </button>
                {open === g.fingerprint && (
                  <div className="space-y-2 border-t bg-muted/30 p-3 text-xs">
                    <p>
                      <span className="font-semibold">Mã nhóm:</span> <code>{g.fingerprint}</code>
                      {g.digest && (
                        <>
                          {" "}
                          · <span className="font-semibold">Digest:</span> <code>{g.digest}</code>
                        </>
                      )}
                      {g.release && <> · Phiên bản {g.release}</>}
                    </p>
                    <p>
                      <span className="font-semibold">Lần đầu:</span> {relativeTime(g.firstSeen)}
                      {g.paths.length > 0 && (
                        <>
                          {" "}
                          · <span className="font-semibold">Trang:</span> {g.paths.join(", ")}
                        </>
                      )}
                    </p>
                    {g.context !== null && typeof g.context === "object" && Object.keys(g.context).length > 0 && <pre className="overflow-x-auto rounded-lg bg-card p-2 ring-1 ring-border">{JSON.stringify(g.context, null, 2)}</pre>}
                    {g.stack && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-2 text-slate-100">{g.stack}</pre>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {errors.available && (
          <Button type="button" variant="ghost" size="sm" className="min-h-9 rounded-lg" disabled={working} onClick={purge}>
            <Trash2 /> Xoá nhật ký cũ hơn 90 ngày
          </Button>
        )}
      </section>

      {/* Toàn vẹn dữ liệu */}
      <section className="space-y-3" aria-labelledby="integrity-heading">
        <h2 id="integrity-heading" className="text-base font-bold">
          Toàn vẹn dữ liệu
        </h2>
        {!integrity.available ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Chưa có báo cáo — hãy chạy supabase/apply-monitoring.sql.</p>
        ) : (
          <ul className="divide-y rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {integrity.items.map((i) => (
              <li key={i.check_key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", i.total === 0 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : SEVERITY[i.severity] ?? SEVERITY.info)}>
                    {i.total === 0 ? "Ổn" : i.severity === "critical" ? "Nghiêm trọng" : i.severity === "warning" ? "Cần xử lý" : "Thông tin"}
                  </span>
                  {i.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">{i.total}</span>
                  {i.check_key === "storage_orphans" && i.total > 0 && (
                    <Button type="button" size="sm" variant="outline" className="min-h-8 rounded-lg" disabled={working} onClick={cleanup}>
                      {working ? <Loader2 className="animate-spin" /> : <Trash2 />} Dọn file
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Xoá học sinh → điểm danh, sổ liên lạc, học phí, bài tập, đơn nghỉ… tự xoá theo (ON DELETE CASCADE); bản ghi cũ vẫn lưu trong Nhật ký thay đổi.
          Hướng dẫn sao lưu &amp; khôi phục: <code className="rounded bg-muted px-1">docs/backup-disaster-recovery.md</code>.
        </p>
      </section>
    </div>
  );
}
