import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { isISODate } from "@/lib/date";
import { requireRole } from "@/features/auth/queries";
import { getSecurityReport, listAuditLogs, type AuditFilters } from "@/features/audit/queries";
import { AUDIT_ACTIONS, AUDIT_ROLES, AUDIT_TABLES, AUDIT_TABLE_KEYS, type AuditAction, type AuditRole } from "@/features/audit/constants";
import { AuditLogList } from "@/features/audit/components/audit-log-list";
import { SecurityReport } from "@/features/audit/components/security-report";

export const metadata: Metadata = { title: "Nhật ký & bảo mật" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BASE = "/admin/audit-logs";
const one = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (Array.isArray(v) ? v[0] : v === "" ? undefined : v), schema.optional().catch(undefined));
const paramsSchema = z.object({
  tab: one(z.enum(["logs", "security"])),
  table: one(z.enum(AUDIT_TABLE_KEYS as [string, ...string[]])),
  action: one(z.enum(Object.keys(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]])),
  role: one(z.enum(Object.keys(AUDIT_ROLES) as [AuditRole, ...AuditRole[]])),
  from: one(z.string().refine(isISODate)),
  to: one(z.string().refine(isISODate)),
  student: one(z.string().uuid()),
  user: one(z.string().uuid()),
  before: one(z.coerce.number().int().positive()),
});
type Params = z.infer<typeof paramsSchema>;

function hrefWith(current: Params, patch: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, before: undefined, ...patch })) if (v !== undefined && v !== "") search.set(k, String(v));
  const qs = search.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const p = paramsSchema.parse(await searchParams);
  const tab = p.tab ?? "logs";
  const tabClass = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-center text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Nhật ký & bảo mật</h1>
        <p className="text-sm text-muted-foreground">
          Mọi thao tác tạo / sửa / xoá dữ liệu nhạy cảm của giáo viên, quản trị viên và hệ thống — ghi tự động, không ai sửa hay xoá được. Dùng để tra
          soát khi có tranh chấp hoặc nhầm lẫn.
        </p>
      </div>
      <nav className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Chọn mục">
        <Link href={BASE} className={tabClass(tab === "logs")} aria-current={tab === "logs" ? "page" : undefined}>
          Nhật ký hoạt động
        </Link>
        <Link href={`${BASE}?tab=security`} className={tabClass(tab === "security")} aria-current={tab === "security" ? "page" : undefined}>
          Kiểm tra bảo mật
        </Link>
      </nav>
      {tab === "security" ? <SecurityTab /> : <LogsTab p={p} />}
    </div>
  );
}

const MIGRATION_NOTE = (
  <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
    Database chưa có nhật ký hoạt động — chạy file <code>supabase/apply-security-audit.sql</code> trong Supabase SQL Editor.
  </p>
);

async function SecurityTab() {
  const report = await getSecurityReport();
  return report.available ? <SecurityReport findings={report.findings} /> : MIGRATION_NOTE;
}

async function LogsTab({ p }: { p: Params }) {
  const filters: AuditFilters = {
    table: (p.table as AuditFilters["table"]) ?? null,
    action: p.action ?? null,
    role: p.role ?? null,
    from: p.from ?? null,
    to: p.to ?? null,
    studentId: p.student ?? null,
    userId: p.user ?? null,
    before: p.before ?? null,
  };
  const logs = await listAuditLogs(filters);
  if (!logs.available) return MIGRATION_NOTE;
  const last = logs.items.at(-1);
  const select = "h-10 rounded-lg border bg-background px-2 text-sm";
  const person = filters.studentId
    ? logs.items.find((i) => i.studentId === filters.studentId)?.studentName ?? "học sinh đã chọn"
    : null;
  const actor = filters.userId ? logs.items.find((i) => i.userId === filters.userId)?.actorName ?? "người đã chọn" : null;

  return (
    <div className="space-y-3">
      <form method="get" action={BASE} className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3">
        {p.student && <input type="hidden" name="student" value={p.student} />}
        {p.user && <input type="hidden" name="user" value={p.user} />}
        <label className="grid gap-1 text-xs font-semibold">
          Dữ liệu
          <select name="table" defaultValue={p.table ?? ""} className={select}>
            <option value="">Tất cả</option>
            {AUDIT_TABLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {AUDIT_TABLES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Thao tác
          <select name="action" defaultValue={p.action ?? ""} className={select}>
            <option value="">Tất cả</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Người thao tác
          <select name="role" defaultValue={p.role ?? ""} className={select}>
            <option value="">Tất cả</option>
            {Object.entries(AUDIT_ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Từ ngày
          <input type="date" name="from" defaultValue={p.from ?? ""} className={select} />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Đến ngày
          <input type="date" name="to" defaultValue={p.to ?? ""} className={select} />
        </label>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Lọc
        </button>
        <Link href={BASE} className="h-10 content-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
          Xoá lọc
        </Link>
      </form>

      {(person || actor) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {person && (
            <Link href={hrefWith(p, { student: undefined })} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
              Học sinh: {person} <X className="size-3.5" aria-label="Bỏ lọc học sinh" />
            </Link>
          )}
          {actor && (
            <Link href={hrefWith(p, { user: undefined })} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
              Người thao tác: {actor} <X className="size-3.5" aria-label="Bỏ lọc người thao tác" />
            </Link>
          )}
        </div>
      )}

      <AuditLogList items={logs.items} filterHref={(patch) => hrefWith(p, patch)} />

      {logs.hasMore && last && (
        <Link href={hrefWith(p, { before: String(last.id) })} className="block rounded-xl border bg-card py-3 text-center text-sm font-semibold text-primary hover:bg-muted">
          Xem thao tác cũ hơn
        </Link>
      )}
    </div>
  );
}
