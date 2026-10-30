import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";
import { AUDIT_ACTIONS, AUDIT_FIELDS, AUDIT_ROLES, AUDIT_TABLES, AUDIT_VALUE_LABELS, type AuditAction } from "../constants";
import type { AuditLogItem } from "../queries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_FIELDS = new Set(["amount", "paid_amount"]);
const HIDDEN_FIELDS = new Set(["id"]);

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const money = new Intl.NumberFormat("vi-VN");

function formatValue(field: string, value: Json | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return MONEY_FIELDS.has(field) ? `${money.format(value)}đ` : String(value);
  if (typeof value === "string") {
    if (AUDIT_VALUE_LABELS[value]) return AUDIT_VALUE_LABELS[value];
    if (UUID_RE.test(value)) return `#${value.slice(0, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return timeFormat.format(new Date(value));
    return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  }
  if (Array.isArray(value) && value.length === 0) return "—";
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

function fieldLabel(field: string) {
  return AUDIT_FIELDS[field] ?? field;
}

function Diff({ item }: { item: AuditLogItem }) {
  const fields =
    item.action === "UPDATE"
      ? (item.changedFields ?? [])
      : Object.keys((item.action === "DELETE" ? item.oldData : item.newData) ?? {}).filter((f) => !HIDDEN_FIELDS.has(f));
  if (fields.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-semibold">Trường</th>
            {item.action !== "CREATE" && <th className="py-1 pr-3 font-semibold">Trước</th>}
            {item.action !== "DELETE" && <th className="py-1 font-semibold">Sau</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((f) => (
            <tr key={f} className="align-top">
              <td className="py-1.5 pr-3 font-medium">{fieldLabel(f)}</td>
              {item.action !== "CREATE" && <td className="py-1.5 pr-3 text-red-700 line-through decoration-red-300 dark:text-red-300">{formatValue(f, item.oldData?.[f])}</td>}
              {item.action !== "DELETE" && <td className="py-1.5 text-emerald-700 dark:text-emerald-300">{formatValue(f, item.newData?.[f])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditLogList({ items, filterHref }: { items: AuditLogItem[]; filterHref: (patch: Record<string, string>) => string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Không có thao tác nào khớp bộ lọc.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const action = AUDIT_ACTIONS[item.action as AuditAction];
        const role = AUDIT_ROLES[item.actorRole as keyof typeof AUDIT_ROLES] ?? item.actorRole;
        const fields = item.action === "UPDATE" && item.changedFields?.length ? item.changedFields.map(fieldLabel).join(", ") : null;
        return (
          <li key={item.id} className="rounded-2xl bg-card p-3 text-sm shadow-sm ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", action?.className)}>{action?.label ?? item.action}</span>
              <span className="font-semibold">{AUDIT_TABLES[item.table as keyof typeof AUDIT_TABLES] ?? item.table}</span>
              {item.studentId && (
                <Link href={filterHref({ student: item.studentId })} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium hover:underline">
                  {item.studentName ?? `HS #${item.studentId.slice(0, 8)}`}
                </Link>
              )}
              <time className="ml-auto text-xs text-muted-foreground" dateTime={item.createdAt}>
                {timeFormat.format(new Date(item.createdAt))}
              </time>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.userId ? (
                <Link href={filterHref({ user: item.userId })} className="font-semibold text-foreground hover:underline">
                  {item.actorName || "Tài khoản đã xoá"}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">{item.actorName || "Hệ thống"}</span>
              )}{" "}
              · {role}
              {fields && <> · đổi: {fields}</>}
              {item.recordId && <> · mã #{item.recordId.slice(0, 8)}</>}
            </p>
            <details className="mt-2 group">
              <summary className="cursor-pointer select-none text-xs font-semibold text-primary">Xem chi tiết thay đổi</summary>
              <div className="mt-2 rounded-lg bg-muted/40 p-2">
                <Diff item={item} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
