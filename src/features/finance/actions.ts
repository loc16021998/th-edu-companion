"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isISODate } from "@/lib/date";
import { toTransferText } from "@/lib/vietqr";
import { requireRole } from "@/features/auth/queries";
import { schedulePushDelivery } from "@/features/push/deliver";
import type { ActionResult } from "@/types/action-result";

const MIGRATION = "Database chưa cập nhật — chạy file supabase/apply-finance.sql trong Supabase SQL Editor.";

function revalidateFinance() {
  revalidatePath("/admin", "layout");
  revalidatePath("/parent", "layout");
}

// ============================================================================ Hóa đơn hàng loạt

const bulkSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Chọn ít nhất một học sinh").max(500),
  title: z.string().trim().min(2, "Vui lòng nhập tên khoản thu").max(120, "Tên khoản thu quá dài"),
  amount: z.number().int("Số tiền phải là số nguyên").min(1_000, "Số tiền tối thiểu 1.000đ").max(1_000_000_000, "Số tiền quá lớn"),
  dueDate: z.string().refine(isISODate, "Vui lòng chọn hạn thanh toán"),
  /** Kỳ học phí tháng (ngày đầu tháng) — có thì mỗi bé chỉ 1 khoản / tháng (bỏ qua bé đã có) */
  period: z
    .string()
    .nullable()
    .refine((v) => v === null || (isISODate(v) && v.endsWith("-01")), "Tháng không hợp lệ"),
});
export type BulkFeeInput = z.input<typeof bulkSchema>;

/** Tạo hóa đơn cho danh sách học sinh đã chọn (phụ huynh nhận thông báo học phí + push). */
export async function createBulkFees(input: BulkFeeInput): Promise<ActionResult<{ created: number; skipped: number; total: number }>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  await requireRole("admin");
  const v = parsed.data;

  const supabase = await createClient();
  const { data: students, error: stError } = await supabase.from("students").select("id").in("id", v.studentIds);
  if (stError) return { ok: false, error: dbErrorMessage(stError) };
  const rows = students.map((s) => ({ student_id: s.id, title: v.title, amount: v.amount, due_date: v.dueDate, ...(v.period && { period: v.period }) }));

  let created = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = v.period
      ? await supabase.from("fees").upsert(chunk, { onConflict: "student_id,period", ignoreDuplicates: true }).select("id")
      : await supabase.from("fees").insert(chunk).select("id");
    if (res.error) {
      if (["42703", "PGRST204", "42P10"].includes(res.error.code)) return { ok: false, error: "Database chưa có kỳ học phí — chạy file supabase/apply-admin-center.sql." };
      console.error("[finance] createBulkFees lỗi:", res.error);
      return { ok: false, error: dbErrorMessage(res.error) };
    }
    created += res.data.length;
  }

  revalidateFinance();
  schedulePushDelivery();
  return { ok: true, data: { created, skipped: rows.length - created, total: created * v.amount } };
}

// ============================================================================ Ghi nhận đóng tiền nhanh (bảng công nợ)

/** Ghi nhận đã đóng đủ 1 khoản (nhật ký thu tiền tự ghi bằng trigger). */
export async function markFeePaid(feeId: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(feeId).success) return { ok: false, error: "Khoản thu không hợp lệ." };
  await requireRole("admin");
  const supabase = await createClient();
  const { data: fee } = await supabase.from("fees").select("amount").eq("id", feeId).maybeSingle();
  if (!fee) return { ok: false, error: "Không tìm thấy khoản thu." };
  const { error } = await supabase.from("fees").update({ paid_amount: fee.amount }).eq("id", feeId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateFinance();
  return { ok: true, data: null };
}

// ============================================================================ Tài khoản nhận học phí (VietQR)

const configSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/, "Vui lòng chọn ngân hàng"),
  bankName: z.string().trim().min(2).max(60),
  accountNo: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[0-9A-Za-z]{4,19}$/, "Số tài khoản không hợp lệ")),
  accountName: z
    .string()
    .trim()
    .transform((v) => toTransferText(v))
    .pipe(z.string().min(2, "Vui lòng nhập tên chủ tài khoản").max(70)),
});
export type PaymentConfigInput = z.input<typeof configSchema>;

export async function savePaymentConfig(input: PaymentConfigInput): Promise<ActionResult<null>> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("payment_config").upsert(
    { id: true, bank_bin: v.bankBin, bank_name: v.bankName, account_no: v.accountNo, account_name: v.accountName, updated_by: profile.id, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) {
    if (error.code === "PGRST205") return { ok: false, error: MIGRATION };
    return { ok: false, error: dbErrorMessage(error) };
  }
  revalidateFinance();
  return { ok: true, data: null };
}

// ============================================================================ Nhắc học phí

/**
 * Kiểm tra hạn đóng học phí và gửi nhắc nhở: trước hạn 3 ngày + khi quá hạn (ngày 1, 8, 15, 22).
 * Mỗi khoản chỉ nhắc 1 lần / ngày → bấm lại không gửi trùng. Lịch tự động (pg_cron 8h sáng) gọi cùng hàm DB.
 */
export async function runFeeReminders(): Promise<ActionResult<{ dueSoon: number; overdue: number; message: string }>> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_fee_reminders", {});
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { ok: false, error: MIGRATION };
    console.error("[finance] runFeeReminders lỗi:", error);
    return { ok: false, error: dbErrorMessage(error) };
  }
  const row = data?.[0] ?? { due_soon: 0, overdue: 0 };
  revalidatePath("/admin/finance");
  schedulePushDelivery();
  const total = row.due_soon + row.overdue;
  return {
    ok: true,
    data: {
      dueSoon: row.due_soon,
      overdue: row.overdue,
      message: total
        ? `Đã gửi ${total} lời nhắc (${row.due_soon} sắp đến hạn, ${row.overdue} quá hạn) tới phụ huynh.`
        : "Hôm nay không có khoản nào cần nhắc (hoặc đã nhắc rồi).",
    },
  };
}


// ============================================================================ Đối soát ngân hàng (tự gạch nợ)

async function adminClientOrError() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

/** Gán tay giao dịch chưa khớp (hoặc phần tiền thừa) cho 1 học sinh → gạch nợ như tự động. */
export async function assignBankTransaction(txnId: string, studentId: string): Promise<ActionResult<{ message: string }>> {
  if (!z.string().uuid().safeParse(txnId).success || !z.string().uuid().safeParse(studentId).success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const admin = await adminClientOrError();
  if (!admin) return { ok: false, error: "Server chưa có SUPABASE_SERVICE_ROLE_KEY." };
  const { data: txn } = await admin.from("bank_transactions").select("id, amount, content, status, applied_amount").eq("id", txnId).maybeSingle();
  if (!txn) return { ok: false, error: "Không tìm thấy giao dịch." };
  if (txn.status === "matched" || txn.status === "ignored") return { ok: false, error: "Giao dịch đã được xử lý." };
  const { reconcileTransaction } = await import("./reconcile");
  const r = await reconcileTransaction(
    admin,
    { id: txn.id, amount: Number(txn.amount), content: txn.content, appliedBefore: Number(txn.applied_amount) },
    { studentId, handledBy: profile.id },
  );
  revalidateFinance();
  schedulePushDelivery();
  return { ok: true, data: { message: r.note } };
}

/** Bỏ qua giao dịch không phải học phí (vd. tiền khác chuyển vào tài khoản). */
export async function ignoreBankTransaction(txnId: string, note: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(txnId).success) return { ok: false, error: "Giao dịch không hợp lệ." };
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_transactions")
    .update({ status: "ignored", note: note.trim().slice(0, 200) || "Không phải học phí", handled_by: profile.id })
    .eq("id", txnId);
  if (error) return { ok: false, error: dbErrorMessage(error) };
  revalidateFinance();
  return { ok: true, data: null };
}

const simulateSchema = z.object({
  content: z.string().trim().min(3, "Nhập nội dung chuyển khoản").max(200),
  amount: z.number().int().min(1_000, "Số tiền tối thiểu 1.000đ").max(1_000_000_000),
});

/**
 * Giả lập 1 giao dịch tiền vào (không qua ngân hàng) để kiểm tra luồng tự gạch nợ trước khi kết nối SePay/Casso.
 * Ghi nhận THẬT vào học phí của học sinh — dùng với số tiền nhỏ hoặc trên dữ liệu thử.
 */
export async function simulateBankTransaction(input: z.input<typeof simulateSchema>): Promise<ActionResult<{ message: string; status: string }>> {
  const parsed = simulateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const profile = await requireRole("admin");
  const admin = await adminClientOrError();
  if (!admin) return { ok: false, error: "Server chưa có SUPABASE_SERVICE_ROLE_KEY." };
  const { data: row, error } = await admin
    .from("bank_transactions")
    .insert({ provider: "test", provider_txn_id: crypto.randomUUID(), amount: parsed.data.amount, content: parsed.data.content, txn_at: new Date().toISOString(), handled_by: profile.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "PGRST205" ? "Database chưa cập nhật — chạy file supabase/apply-bank-reconcile.sql." : dbErrorMessage(error) };
  const { reconcileTransaction } = await import("./reconcile");
  const r = await reconcileTransaction(admin, { id: row.id, amount: parsed.data.amount, content: parsed.data.content }, { handledBy: profile.id });
  revalidateFinance();
  schedulePushDelivery();
  return { ok: true, data: { status: r.status, message: r.studentName ? `${r.studentName}: ${r.note}` : r.note } };
}
