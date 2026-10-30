import "server-only";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = "id, student_id, title, amount, paid_amount, status, due_date, created_at";

export async function listFees(studentId?: string): Promise<FeeWithStudent[]> {
  const supabase = await createClient();
  const run = (columns: string) => {
    let query = supabase
      .from("fees")
      .select(`${columns}, student:students(full_name, class_name)`)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (studentId) query = query.eq("student_id", studentId);
    return query;
  };
  // `period` (kỳ học phí tháng) có từ migration admin-center — DB cũ đọc lại không có cột này
  let res = await run(`${COLUMNS}, period`);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) res = await run(COLUMNS);
  if (res.error) throw res.error;
  return res.data as unknown as FeeWithStudent[];
}

export type FeeWithStudent = {
  id: string;
  student_id: string;
  title: string;
  amount: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid";
  due_date: string | null;
  created_at: string;
  period?: string | null;
  student: { full_name: string; class_name: string } | null;
};
