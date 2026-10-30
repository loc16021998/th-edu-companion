import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204";
}

export type PaymentConfig = { bankBin: string; bankName: string; accountNo: string; accountName: string; updatedAt: string };

/** Tài khoản nhận học phí của trung tâm (mọi người dùng đã đăng nhập đọc được để tạo VietQR). */
export async function getPaymentConfig(): Promise<PaymentConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_config").select("bank_bin, bank_name, account_no, account_name, updated_at").maybeSingle();
  if (error || !data) return null;
  return { bankBin: data.bank_bin, bankName: data.bank_name, accountNo: data.account_no, accountName: data.account_name, updatedAt: data.updated_at };
}

/** Mã học sinh (TH00012) — null khi DB chưa chạy migration tài chính. */
export async function getStudentCode(studentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("student_code").eq("id", studentId).maybeSingle();
  return error ? null : (data?.student_code ?? null);
}

export type DebtRow = {
  id: string;
  title: string;
  amount: number;
  paid: number;
  status: Enums<"fee_status">;
  dueDate: string | null;
  period: string | null;
  createdAt: string;
  student: { id: string; name: string; code: string | null; className: string; campus: Enums<"campus"> };
  parent: { name: string; phone: string | null } | null;
};

/** Toàn bộ khoản thu kèm học sinh / lớp / cơ sở / phụ huynh — cho bảng công nợ (quản trị). */
export async function listDebts(): Promise<DebtRow[]> {
  const supabase = await createClient();
  const run = (studentCols: string, feeCols: string) =>
    supabase
      .from("fees")
      .select(`${feeCols}, student:students!inner(${studentCols}, parent:profiles!students_parent_id_fkey(full_name, phone))`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10000);
  let res = await run("id, full_name, class_name, campus, student_code", "id, title, amount, paid_amount, status, due_date, period, created_at");
  // DB chưa chạy migration tài chính / admin-center → đọc lại không có cột mới
  if (res.error && isMissing(res.error.code)) res = await run("id, full_name, class_name, campus", "id, title, amount, paid_amount, status, due_date, created_at");
  if (res.error) throw new Error("Không tải được công nợ", { cause: res.error });

  type Raw = {
    id: string;
    title: string;
    amount: number;
    paid_amount: number;
    status: Enums<"fee_status">;
    due_date: string | null;
    period?: string | null;
    created_at: string;
    student: { id: string; full_name: string; class_name: string; campus: Enums<"campus">; student_code?: string | null; parent: { full_name: string; phone: string | null } | null };
  };
  return (res.data as unknown as Raw[]).map((f) => ({
    id: f.id,
    title: f.title,
    amount: Number(f.amount),
    paid: Number(f.paid_amount),
    status: f.status,
    dueDate: f.due_date,
    period: f.period ?? null,
    createdAt: f.created_at,
    student: { id: f.student.id, name: f.student.full_name, code: f.student.student_code ?? null, className: f.student.class_name, campus: f.student.campus },
    parent: f.student.parent ? { name: f.student.parent.full_name, phone: f.student.parent.phone } : null,
  }));
}

export type ReminderRun = { runDate: string; dueSoon: number; overdue: number; createdAt: string; auto: boolean };

/** Các lần chạy nhắc học phí gần đây (tự động lúc 8h sáng hoặc bấm tay). */
export async function listReminderRuns(limit = 7): Promise<{ available: boolean; runs: ReminderRun[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_reminder_runs")
    .select("run_date, due_soon, overdue, created_at, triggered_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { available: !isMissing(error.code), runs: [] };
  return {
    available: true,
    runs: data.map((r) => ({ runDate: r.run_date, dueSoon: r.due_soon, overdue: r.overdue, createdAt: r.created_at, auto: r.triggered_by === null })),
  };
}

export type BankTxn = {
  id: string;
  provider: string;
  amount: number;
  applied: number;
  content: string;
  at: string;
  status: "matched" | "partial" | "unmatched" | "ignored";
  note: string | null;
  studentName: string | null;
};

/** Giao dịch ngân hàng gần đây (đối soát). */
export async function listBankTransactions(limit = 100): Promise<{ available: boolean; items: BankTxn[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("id, provider, amount, applied_amount, content, txn_at, created_at, status, note, student:students(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissing(error.code)) return { available: false, items: [] };
    throw new Error("Không tải được giao dịch ngân hàng", { cause: error });
  }
  type Raw = { id: string; provider: string; amount: number; applied_amount: number; content: string; txn_at: string | null; created_at: string; status: string; note: string | null; student: { full_name: string } | null };
  return {
    available: true,
    items: (data as unknown as Raw[]).map((t) => ({
      id: t.id,
      provider: t.provider,
      amount: Number(t.amount),
      applied: Number(t.applied_amount),
      content: t.content,
      at: t.txn_at ?? t.created_at,
      status: (["matched", "partial", "unmatched", "ignored"].includes(t.status) ? t.status : "unmatched") as BankTxn["status"],
      note: t.note,
      studentName: t.student?.full_name ?? null,
    })),
  };
}
