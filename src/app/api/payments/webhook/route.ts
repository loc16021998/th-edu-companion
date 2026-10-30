import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardSecret, matchesSecret } from "@/lib/security/secret-route";
import { deliverPendingNotifications } from "@/features/push/deliver";
import { reconcileTransaction } from "@/features/finance/reconcile";

/**
 * Webhook biến động số dư → tự gạch nợ học phí.
 *   - SePay:  Webhooks → URL này, kiểu xác thực "API Key" → header `Authorization: Apikey <PAYMENT_WEBHOOK_SECRET>`.
 *   - Casso:  Webhook → URL này, "Khoá bảo mật" = PAYMENT_WEBHOOK_SECRET → header `Secure-Token`.
 *   (Cũng nhận `Authorization: Bearer <secret>` cho dịch vụ khác.)
 * Chỉ xử lý tiền VÀO; mỗi giao dịch xử lý đúng 1 lần (unique provider + mã giao dịch).
 */
export const dynamic = "force-dynamic";

/** Payload ngân hàng chỉ vài KB */
const MAX_BODY_CHARS = 256 * 1024;

type Txn = { provider: string; id: string; amount: number; content: string; accountNo: string | null; at: string | null };

function authorized(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^(Apikey|Bearer)\s+/i, "") || request.headers.get("secure-token") || "";
  return matchesSecret(token, [process.env.PAYMENT_WEBHOOK_SECRET]);
}

/** Giờ ngân hàng (VN, "2026-11-08 09:15:00") → ISO. */
function vnTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(" ", "T")}+07:00` : value;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const idValue = z.union([z.string().max(100), z.number()]).transform(String);
const text = z.string().max(1000).nullish();
const dateText = z.string().max(40).nullish();
const amount = z.coerce.number().finite().max(10_000_000_000);

/** SePay — giao dịch đơn */
const sepaySchema = z.object({
  id: idValue.optional(),
  referenceCode: idValue.nullish(),
  transferType: z.enum(["in", "out"]),
  transferAmount: amount,
  content: text,
  description: text,
  accountNumber: idValue.nullish(),
  transactionDate: dateText,
});

/** Casso — v1: data[], v2: data{} */
const cassoTxnSchema = z.object({
  id: idValue.optional(),
  tid: idValue.nullish(),
  reference: idValue.nullish(),
  amount,
  description: text,
  accountNumber: idValue.nullish(),
  bank_sub_acc_id: idValue.nullish(),
  transactionDateTime: dateText,
  when: dateText,
});
const cassoSchema = z.object({ data: z.union([z.array(cassoTxnSchema).max(100), cassoTxnSchema]) });

/** Chuẩn hoá payload SePay / Casso → danh sách giao dịch tiền vào; null = sai định dạng. */
function normalize(body: unknown): Txn[] | null {
  const sepay = sepaySchema.safeParse(body);
  if (sepay.success) {
    const d = sepay.data;
    if (d.transferType !== "in") return [];
    return [
      {
        provider: "sepay",
        id: d.id ?? d.referenceCode ?? "",
        amount: d.transferAmount,
        content: d.content ?? d.description ?? "",
        accountNo: d.accountNumber ?? null,
        at: vnTime(d.transactionDate),
      },
    ];
  }
  const casso = cassoSchema.safeParse(body);
  if (!casso.success) return null;
  const list = Array.isArray(casso.data.data) ? casso.data.data : [casso.data.data];
  return list
    .map((d) => ({
      provider: "casso",
      id: d.id ?? d.tid ?? d.reference ?? "",
      amount: d.amount,
      content: d.description ?? "",
      accountNo: d.accountNumber ?? d.bank_sub_acc_id ?? null,
      at: vnTime(d.transactionDateTime ?? d.when),
    }))
    .filter((t) => t.amount > 0);
}

export async function POST(request: NextRequest) {
  const rejected = await guardSecret(request, authorized(request));
  if (rejected) return rejected;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ success: false, error: "missing service role" }, { status: 500 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ success: false, error: "payload too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "invalid json" }, { status: 400 });
  }
  const txns = normalize(body);
  if (!txns) return NextResponse.json({ success: false, error: "invalid payload" }, { status: 422 });

  const admin = createAdminClient();
  const { data: config } = await admin.from("payment_config").select("account_no").maybeSingle();
  const results: { id: string; status: string }[] = [];

  for (const t of txns) {
    if (!t.id || !Number.isFinite(t.amount) || t.amount <= 0) continue;
    // Giao dịch vào tài khoản khác (dùng chung tài khoản SePay/Casso) → bỏ qua
    if (config?.account_no && t.accountNo && t.accountNo !== config.account_no) {
      results.push({ id: t.id, status: "other-account" });
      continue;
    }
    const { data: row, error } = await admin
      .from("bank_transactions")
      .upsert(
        { provider: t.provider, provider_txn_id: t.id, amount: t.amount, content: t.content, account_no: t.accountNo, txn_at: t.at, raw: body as never },
        { onConflict: "provider,provider_txn_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[payments] Không lưu được giao dịch:", error);
      return NextResponse.json({ success: false, error: "db" }, { status: 500 });
    }
    if (!row) {
      results.push({ id: t.id, status: "duplicate" }); // đã xử lý trước đó (ngân hàng gửi lại)
      continue;
    }
    const r = await reconcileTransaction(admin, { id: row.id, amount: t.amount, content: t.content });
    results.push({ id: t.id, status: r.status });
  }

  // Đẩy thông báo "đã nhận học phí" cho phụ huynh sau khi phản hồi
  after(async () => {
    try {
      await deliverPendingNotifications();
    } catch (err) {
      console.error("[payments] Gửi thông báo thất bại:", err);
    }
  });
  return NextResponse.json({ success: true, results });
}
