import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatVND } from "@/lib/utils";
import { toTransferText } from "@/lib/vietqr";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Đọc mã học sinh + tháng trong nội dung chuyển khoản. Ngân hàng hay bỏ dấu cách / gạch ngang / chữ thường hoá,
 * thêm tiền tố ("MBVCB.123.TH00012 TRAN MINH AN T11 2026") → so khớp linh hoạt.
 */
export function parseTransferContent(content: string): { code: string | null; month: string | null } {
  const text = toTransferText(content).replace(/-/g, " ");
  const code = text.match(/TH\s?(\d{5})(?!\d)/)?.[1];
  // "T11 2026", "T112026" (viết liền), "T3 2027"
  const m = text.match(/T\s?(1[0-2]|0?[1-9])\s?(20\d{2})(?!\d)/);
  const month = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1]!.padStart(2, "0")}-01` : null;
  return { code: code ? `TH${code}` : null, month };
}

export type ReconcileResult = {
  status: "matched" | "partial" | "unmatched";
  studentName: string | null;
  applied: number;
  leftover: number;
  fees: { id: string; title: string; paid: number }[];
  note: string;
};

/** Ghi 1 dòng vào bảng tin quản trị (service role). Lỗi bỏ qua — không chặn việc gạch nợ. */
async function adminFeed(admin: Admin, row: { actorId: string | null; actorRole: "parent" | "system"; actorName: string; title: string; body: string; href: string }) {
  const { error } = await admin.from("admin_notifications").insert({
    category: "payment",
    actor_id: row.actorId,
    actor_role: row.actorRole,
    actor_name: row.actorName,
    title: row.title,
    body: row.body,
    href: row.href,
  });
  if (error && error.code !== "PGRST205") console.warn("[reconcile] Không ghi được bảng tin:", error.message);
}

/**
 * Phân bổ 1 giao dịch tiền vào học phí của học sinh: ưu tiên khoản đúng THÁNG ghi trong nội dung, rồi các khoản
 * nợ cũ nhất (hạn sớm nhất). Đủ tiền → khoản "đã hoàn thành"; thiếu → "đóng một phần"; thừa → giữ lại (partial) để xử lý tay.
 * `studentId`: quản trị viên gán tay (giao dịch chưa khớp). Trigger DB tự ghi nhật ký thu tiền + báo phụ huynh "đã nhận học phí".
 */
export async function reconcileTransaction(
  admin: Admin,
  txn: { id: string; amount: number; content: string; appliedBefore?: number },
  opts: { studentId?: string; handledBy?: string | null } = {},
): Promise<ReconcileResult> {
  const available = Math.max(Number(txn.amount) - (opts.studentId ? (txn.appliedBefore ?? 0) : 0), 0);
  const { code, month } = parseTransferContent(txn.content);

  let student: { id: string; full_name: string; parent_id: string | null } | null = null;
  if (opts.studentId) {
    student = (await admin.from("students").select("id, full_name, parent_id").eq("id", opts.studentId).maybeSingle()).data;
  } else if (code) {
    student = (await admin.from("students").select("id, full_name, parent_id").eq("student_code", code).maybeSingle()).data;
  }

  const finish = async (result: ReconcileResult, extra: { student_id?: string | null; matched_fee_ids?: string[] } = {}) => {
    await admin
      .from("bank_transactions")
      .update({
        status: result.status,
        note: result.note,
        applied_amount: (opts.studentId ? (txn.appliedBefore ?? 0) : 0) + result.applied,
        handled_by: opts.handledBy ?? null,
        ...extra,
      })
      .eq("id", txn.id);
    return result;
  };

  if (!student) {
    const note = code ? `Không tìm thấy học sinh mã ${code}` : "Nội dung không có mã học sinh (THxxxxx)";
    await adminFeed(admin, {
      actorId: null,
      actorRole: "system",
      actorName: "Ngân hàng",
      title: `Giao dịch chưa khớp: +${formatVND(available)}`,
      body: `${note} · “${txn.content.slice(0, 120)}”`,
      href: "/admin/finance?tab=bank",
    });
    return finish({ status: "unmatched", studentName: null, applied: 0, leftover: available, fees: [], note });
  }

  const { data: open } = await admin
    .from("fees")
    .select("id, title, amount, paid_amount, period, due_date, created_at")
    .eq("student_id", student.id)
    .neq("status", "paid")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const fees = (open ?? []).sort((a, b) => Number(b.period === month) - Number(a.period === month));

  let left = available;
  const touched: ReconcileResult["fees"] = [];
  for (const f of fees) {
    if (left <= 0) break;
    const remaining = Number(f.amount) - Number(f.paid_amount);
    if (remaining <= 0) continue;
    const pay = Math.min(left, remaining);
    // Cập nhật có điều kiện (paid_amount chưa đổi) → 2 giao dịch đồng thời không cộng sai
    const { data: updated } = await admin
      .from("fees")
      .update({ paid_amount: Number(f.paid_amount) + pay })
      .eq("id", f.id)
      .eq("paid_amount", f.paid_amount)
      .select("id");
    if (!updated?.length) continue;
    left -= pay;
    touched.push({ id: f.id, title: f.title, paid: pay });
  }

  const applied = available - left;
  const status: ReconcileResult["status"] = applied === 0 ? "unmatched" : left > 0 ? "partial" : "matched";
  const note =
    applied === 0
      ? "Học sinh không còn khoản học phí nào cần đóng"
      : left > 0
        ? `Đã gạch ${formatVND(applied)}, còn thừa ${formatVND(left)} chưa gán`
        : `Đã gạch nợ ${touched.length} khoản`;

  const parent = student.parent_id
    ? (await admin.from("profiles").select("full_name").eq("id", student.parent_id).maybeSingle()).data
    : null;
  await adminFeed(admin, {
    actorId: student.parent_id,
    actorRole: applied > 0 && student.parent_id ? "parent" : "system",
    actorName: applied > 0 ? (parent?.full_name ?? "") : "Ngân hàng",
    title: applied > 0 ? `Tự gạch nợ: bé ${student.full_name} +${formatVND(applied)}` : `Giao dịch chưa khớp: bé ${student.full_name} +${formatVND(available)}`,
    body: applied > 0 ? `${touched.map((t) => t.title).join(", ")}${left > 0 ? ` · thừa ${formatVND(left)}` : ""}` : note,
    href: applied > 0 && left === 0 ? "/admin/finance" : "/admin/finance?tab=bank",
  });

  return finish(
    { status, studentName: student.full_name, applied, leftover: left, fees: touched, note },
    { student_id: student.id, matched_fee_ids: touched.map((t) => t.id) },
  );
}
