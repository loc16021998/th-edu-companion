import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BellRing, Landmark, ReceiptText, Table2, type LucideIcon } from "lucide-react";
import { addDays, todayVN } from "@/lib/date";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { listClasses } from "@/features/admin/queries";
import { getPaymentConfig, listBankTransactions, listDebts, listReminderRuns } from "@/features/finance/queries";
import { BankReconcile } from "@/features/finance/components/bank-reconcile";
import { DebtBoard } from "@/features/finance/components/debt-board";
import { BulkInvoice, type InvoiceStudent } from "@/features/finance/components/bulk-invoice";
import { PaymentConfigForm, ReminderPanel } from "@/features/finance/components/finance-settings";

export const metadata: Metadata = { title: "Quản lý tài chính" };

const TABS: { key: "debts" | "bulk" | "bank" | "settings"; label: string; icon: LucideIcon }[] = [
  { key: "debts", label: "Công nợ", icon: Table2 },
  { key: "bulk", label: "Hóa đơn hàng loạt", icon: ReceiptText },
  { key: "bank", label: "Đối soát ngân hàng", icon: Landmark },
  { key: "settings", label: "Thanh toán & nhắc nợ", icon: BellRing },
];
type Tab = (typeof TABS)[number]["key"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "debts";
  const today = todayVN();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Quản lý tài chính</h1>
        <p className="text-sm text-muted-foreground">Công nợ học phí CS1 Xa La & CS2 Ngô Thì Nhậm, tạo hóa đơn hàng loạt, VietQR và nhắc học phí tự động.</p>
      </div>
      <nav aria-label="Mục tài chính" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 sm:grid-cols-4">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin/finance?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-1 text-center text-xs font-semibold leading-tight transition-colors sm:text-sm",
              tab === key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="hidden size-4 shrink-0 sm:block" /> {label}
          </Link>
        ))}
      </nav>
      {tab === "debts" && <DebtsTab today={today} />}
      {tab === "bulk" && <BulkTab today={today} />}
      {tab === "bank" && <BankTab />}
      {tab === "settings" && <SettingsTab today={today} />}
    </div>
  );
}

async function DebtsTab({ today }: { today: string }) {
  const rows = await listDebts();
  return <DebtBoard rows={rows} today={today} />;
}

/** Học sinh kèm mã (DB chưa có mã học sinh → đọc lại không có cột đó). */
async function loadStudents(): Promise<InvoiceStudent[]> {
  const supabase = await createClient();
  const res = await supabase.from("students").select("id, full_name, campus, class_name, student_code").order("full_name");
  const rows = res.error
    ? ((await supabase.from("students").select("id, full_name, campus, class_name").order("full_name")).data ?? []).map((s) => ({ ...s, student_code: null }))
    : res.data;
  return rows.map((s) => ({ id: s.id, name: s.full_name, code: s.student_code ?? null, campus: s.campus, className: s.class_name }));
}

async function BankTab() {
  const [txns, students] = await Promise.all([listBankTransactions(), loadStudents()]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "ten-mien-cua-ban";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <BankReconcile
      items={txns.items}
      available={txns.available}
      students={students.map((s) => ({ id: s.id, name: s.name, code: s.code, className: s.className }))}
      webhookUrl={`${proto}://${host}/api/payments/webhook`}
      secretConfigured={Boolean(process.env.PAYMENT_WEBHOOK_SECRET && process.env.PAYMENT_WEBHOOK_SECRET.length >= 16)}
    />
  );
}

async function BulkTab({ today }: { today: string }) {
  const [classes, students] = await Promise.all([listClasses(), loadStudents()]);
  if (classes.length === 0) {
    return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Chưa có lớp học nào.</p>;
  }
  return (
    <BulkInvoice
      classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name, monthlyFee: c.monthly_fee ?? null }))}
      students={students}
      today={today}
    />
  );
}

async function SettingsTab({ today }: { today: string }) {
  const supabase = await createClient();
  const [config, runs, soonRes, overdueRes] = await Promise.all([
    getPaymentConfig(),
    listReminderRuns(),
    supabase.from("fees").select("id", { count: "exact", head: true }).neq("status", "paid").eq("due_date", addDays(today, 3)),
    supabase.from("fees").select("id", { count: "exact", head: true }).neq("status", "paid").lt("due_date", today),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PaymentConfigForm config={config} />
      <ReminderPanel runs={runs.runs} available={runs.available} preview={{ dueSoon: soonRes.count ?? 0, overdue: overdueRes.count ?? 0 }} />
    </div>
  );
}
