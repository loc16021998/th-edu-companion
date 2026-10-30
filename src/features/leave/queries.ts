import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LeaveReason, LeaveStatus } from "./constants";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

export type LeaveRow = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  parentName: string | null;
  parentPhone: string | null;
  startDate: string;
  endDate: string;
  reason: LeaveReason;
  note: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

const SELECT =
  "id, student_id, start_date, end_date, reason, note, status, decision_note, decided_at, created_at, student:students!inner(full_name, class_name, campus), parent:profiles!leave_requests_parent_id_fkey(full_name, phone), decider:profiles!leave_requests_decided_by_fkey(full_name)";

type Raw = {
  id: string;
  student_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  note: string | null;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  student: { full_name: string; class_name: string };
  parent: { full_name: string; phone: string | null } | null;
  decider: { full_name: string } | null;
};

function toRow(r: Raw): LeaveRow {
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student.full_name,
    className: r.student.class_name,
    parentName: r.parent?.full_name ?? null,
    parentPhone: r.parent?.phone ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    reason: r.reason as LeaveReason,
    note: r.note,
    status: r.status as LeaveStatus,
    decisionNote: r.decision_note,
    decidedBy: r.decider?.full_name ?? null,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

/** Đơn của 1 bé (phụ huynh — RLS). */
export async function listLeaveForStudent(studentId: string): Promise<{ available: boolean; items: LeaveRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_requests").select(SELECT).eq("student_id", studentId).order("created_at", { ascending: false }).limit(30);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được đơn xin nghỉ", { cause: error });
  }
  return { available: true, items: (data as unknown as Raw[]).map(toRow) };
}

/** Đơn của học sinh giáo viên phụ trách / mọi đơn (quản trị) — RLS quyết định. */
export async function listLeaveForStaff(view: "pending" | "done"): Promise<{ available: boolean; items: LeaveRow[] }> {
  const supabase = await createClient();
  let query = supabase.from("leave_requests").select(SELECT);
  query = view === "pending" ? query.eq("status", "pending").order("start_date") : query.neq("status", "pending").order("updated_at", { ascending: false }).limit(60);
  const { data, error } = await query;
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được đơn xin nghỉ", { cause: error });
  }
  return { available: true, items: (data as unknown as Raw[]).map(toRow) };
}

export async function countPendingLeave(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? 0 : (count ?? 0);
}
