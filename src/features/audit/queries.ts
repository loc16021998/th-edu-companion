import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";
import type { AuditAction, AuditRole, AuditTable } from "./constants";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST202";
}

export type AuditFilters = {
  table: AuditTable | null;
  action: AuditAction | null;
  role: AuditRole | null;
  /** YYYY-MM-DD (giờ VN) */
  from: string | null;
  to: string | null;
  studentId: string | null;
  userId: string | null;
  /** Phân trang: id nhỏ hơn */
  before: number | null;
};

export type AuditLogItem = {
  id: number;
  createdAt: string;
  userId: string | null;
  actorName: string | null;
  actorRole: string;
  action: string;
  table: string;
  recordId: string | null;
  studentId: string | null;
  studentName: string | null;
  changedFields: string[] | null;
  oldData: Record<string, Json | undefined> | null;
  newData: Record<string, Json | undefined> | null;
};

const PAGE = 50;

function asObject(value: Json | null): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Nhật ký (RLS: chỉ quản trị viên đọc được). */
export async function listAuditLogs(f: AuditFilters): Promise<{ available: boolean; items: AuditLogItem[]; hasMore: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, created_at, user_id, actor_name, actor_role, action, table_name, record_id, student_id, changed_fields, old_data, new_data")
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (f.table) query = query.eq("table_name", f.table);
  if (f.action) query = query.eq("action", f.action);
  if (f.role) query = query.eq("actor_role", f.role);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00+07:00`);
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59.999+07:00`);
  if (f.studentId) query = query.eq("student_id", f.studentId);
  if (f.userId) query = query.eq("user_id", f.userId);
  if (f.before) query = query.lt("id", f.before);

  const { data, error } = await query;
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [], hasMore: false };
    throw new Error("Không tải được nhật ký hoạt động", { cause: error });
  }
  const rows = data.slice(0, PAGE);

  const studentIds = [...new Set(rows.map((r) => r.student_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (studentIds.length) {
    const { data: students } = await supabase.from("students").select("id, full_name").in("id", studentIds);
    for (const s of students ?? []) names.set(s.id, s.full_name);
  }

  return {
    available: true,
    hasMore: data.length > PAGE,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      action: r.action,
      table: r.table_name,
      recordId: r.record_id,
      studentId: r.student_id,
      // Học sinh đã bị xoá → lấy tên trong bản ghi cũ (nếu là bảng students)
      studentName: (r.student_id && names.get(r.student_id)) || (r.table_name === "students" ? String(asObject(r.old_data)?.full_name ?? "") || null : null),
      changedFields: r.changed_fields,
      oldData: asObject(r.old_data),
      newData: asObject(r.new_data),
    })),
  };
}

export type SecurityFinding = { severity: string; category: string; objectName: string; detail: string };

/** Báo cáo tự kiểm tra cấu hình bảo mật của database. */
export async function getSecurityReport(): Promise<{ available: boolean; findings: SecurityFinding[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("security_audit_report");
  if (error) {
    if (isMissing(error.code)) return { available: false, findings: [] };
    throw new Error("Không chạy được kiểm tra bảo mật", { cause: error });
  }
  return {
    available: true,
    findings: data.map((d) => ({ severity: d.severity, category: d.category, objectName: d.object_name, detail: d.detail })),
  };
}
