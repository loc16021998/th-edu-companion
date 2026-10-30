"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, Copy, FlaskConical, Landmark, Loader2, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/shared/form-field";
import { cn, formatVND } from "@/lib/utils";
import { relativeTime } from "@/features/notifications/format";
import { assignBankTransaction, ignoreBankTransaction, simulateBankTransaction } from "../actions";
import type { BankTxn } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const STATUS: Record<BankTxn["status"], { label: string; badge: string }> = {
  matched: { label: "Đã gạch nợ", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  partial: { label: "Còn tiền thừa", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  unmatched: { label: "Chưa khớp", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
  ignored: { label: "Bỏ qua", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export type ReconcileStudent = { id: string; name: string; code: string | null; className: string };

function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary ring-1 ring-border hover:bg-muted"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Sao chép
    </button>
  );
}

/** Gán giao dịch chưa khớp cho 1 học sinh (tìm theo tên / mã) hoặc bỏ qua. */
function Resolve({ txn, students }: { txn: BankTxn; students: ReconcileStudent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const q = query.trim().toLocaleLowerCase("vi");
  const matches = q ? students.filter((s) => s.name.toLocaleLowerCase("vi").includes(q) || s.code?.toLowerCase().includes(q)).slice(0, 8) : [];

  const run = (fn: () => Promise<{ ok: true; text: string } | { ok: false; text: string }>) => {
    setMsg(null);
    startTransition(async () => {
      setMsg(await fn());
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setOpen(true)}>
          <UserCheck /> Gán học sinh
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg text-muted-foreground"
          disabled={pending}
          onClick={async () =>
            (await confirmSheet({ title: "Bỏ qua giao dịch này?", description: "Đánh dấu là không phải học phí — không gạch nợ khoản nào.", confirmLabel: "Bỏ qua" })) &&
            run(async () => {
              const r = await ignoreBankTransaction(txn.id, "");
              return r.ok ? { ok: true, text: "Đã bỏ qua." } : { ok: false, text: r.error };
            })
          }
        >
          <X /> Bỏ qua
        </Button>
      </div>
    );
  }
  return (
    <div className="w-full space-y-1.5 rounded-xl bg-muted/50 p-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên hoặc mã học sinh (TH…)" className={cn(fieldClass, "h-9")} autoFocus />
      {matches.length > 0 && (
        <ul className="divide-y rounded-lg bg-card ring-1 ring-border">
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await assignBankTransaction(txn.id, s.id);
                    return r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error };
                  })
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="flex-1 font-semibold">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.code ?? ""} · lớp {s.className}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {msg && <span className={cn("text-xs font-medium", msg.ok ? "text-emerald-700" : "text-destructive")}>{msg.text}</span>}
        <button type="button" className="ml-auto text-xs text-muted-foreground" onClick={() => setOpen(false)}>
          Đóng
        </button>
      </div>
    </div>
  );
}

/** Đối soát ngân hàng: hướng dẫn kết nối SePay / Casso, giả lập giao dịch, danh sách giao dịch + xử lý giao dịch chưa khớp. */
export function BankReconcile({
  items,
  students,
  webhookUrl,
  secretConfigured,
  available,
}: {
  items: BankTxn[];
  students: ReconcileStudent[];
  webhookUrl: string;
  secretConfigured: boolean;
  available: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"todo" | "all">("todo");
  const [simContent, setSimContent] = useState("");
  const [simAmount, setSimAmount] = useState("10000");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const todo = items.filter((t) => t.status === "unmatched" || t.status === "partial");
  const shown = view === "todo" ? todo : items;
  const stats = useMemo(() => {
    const matched = items.filter((t) => t.status === "matched");
    return { matched: matched.length, auto: matched.reduce((s, t) => s + t.applied, 0) };
  }, [items]);

  function simulate() {
    setMsg(null);
    startTransition(async () => {
      const r = await simulateBankTransaction({ content: simContent, amount: Number(simAmount || 0) });
      setMsg(r.ok ? { ok: r.data.status !== "unmatched", text: r.data.message } : { ok: false, text: r.error });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <Landmark className="size-5 text-primary" /> Tự động gạch nợ từ ngân hàng
        </h2>
        <p className="text-sm text-muted-foreground">
          Khi tiền vào tài khoản nhận học phí, dịch vụ báo biến động số dư (<b>SePay</b> hoặc <b>Casso</b>) gọi về hệ thống → đọc mã học sinh (THxxxxx) và tháng trong nội dung chuyển khoản → tự ghi nhận vào đúng khoản học phí, báo phụ huynh “Trung tâm đã nhận học phí”. Giao dịch không đọc được mã sẽ chờ bạn gán tay bên dưới.
        </p>
        <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Webhook URL:</span>
            <code className="min-w-0 break-all rounded bg-background px-2 py-0.5 text-xs">{webhookUrl}</code>
            <CopyValue value={webhookUrl} />
          </div>
          <p>
            <b>SePay</b>: Cấu hình → Webhooks → Thêm → URL trên, “Kiểu chứng thực” = <b>API Key</b>, dán giá trị <code>PAYMENT_WEBHOOK_SECRET</code>.
          </p>
          <p>
            <b>Casso</b>: Thiết lập → Webhook → URL trên, “Khoá bảo mật” = giá trị <code>PAYMENT_WEBHOOK_SECRET</code>.
          </p>
          <p className={cn("flex items-center gap-1.5 font-medium", secretConfigured ? "text-emerald-700" : "text-amber-700")}>
            {secretConfigured ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
            {secretConfigured ? "Server đã có PAYMENT_WEBHOOK_SECRET." : "Server chưa có PAYMENT_WEBHOOK_SECRET (≥ 16 ký tự) — thêm vào biến môi trường rồi khởi động lại."}
          </p>
          <p className="text-xs text-muted-foreground">Webhook cần tên miền HTTPS công khai (không dùng được localhost).</p>
        </div>

        <div className="space-y-2 rounded-xl ring-1 ring-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <FlaskConical className="size-4 text-violet-600" /> Giả lập giao dịch (kiểm tra trước khi kết nối)
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <Field label="Nội dung chuyển khoản" htmlFor="sim-content">
              <input id="sim-content" value={simContent} onChange={(e) => setSimContent(e.target.value)} placeholder="TH00012 - TRAN MINH AN - T11 2026" className={fieldClass} />
            </Field>
            <Field label="Số tiền" htmlFor="sim-amount">
              <input
                id="sim-amount"
                inputMode="numeric"
                value={simAmount ? Number(simAmount).toLocaleString("vi-VN") : ""}
                onChange={(e) => setSimAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={cn(fieldClass, "text-right tabular-nums")}
              />
            </Field>
            <Button type="button" className="h-11 self-end rounded-xl" onClick={simulate} disabled={pending || !available}>
              {pending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Chạy thử
            </Button>
          </div>
          <p className="text-xs text-amber-700">Lưu ý: chạy thử ghi nhận THẬT số tiền vào học phí của học sinh khớp mã — nên dùng số tiền nhỏ / dữ liệu thử.</p>
          {msg && <p className={cn("text-sm font-medium", msg.ok ? "text-emerald-700" : "text-destructive")}>{msg.text}</p>}
        </div>
      </section>

      {!available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chạy file <code>supabase/apply-bank-reconcile.sql</code> trong Supabase SQL Editor để bật tự động gạch nợ.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(["todo", "all"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {v === "todo" ? `Cần xử lý${todo.length ? ` (${todo.length})` : ""}` : "Tất cả giao dịch"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Đã tự gạch nợ {stats.matched} giao dịch · {formatVND(stats.auto)} (100 giao dịch gần nhất)
            </p>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              {view === "todo" ? "Không có giao dịch nào cần xử lý 🎉" : "Chưa nhận giao dịch nào từ ngân hàng."}
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
              {shown.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2">
                      <b className="tabular-nums text-emerald-700">+{formatVND(t.amount)}</b>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", STATUS[t.status].badge)}>{STATUS[t.status].label}</span>
                      <span className="text-xs uppercase text-muted-foreground">{t.provider === "test" ? "chạy thử" : t.provider}</span>
                    </p>
                    <p className="break-words font-mono text-xs">{t.content || "(không có nội dung)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(t.at)}
                      {t.studentName && <> · bé {t.studentName}</>}
                      {t.note && <> · {t.note}</>}
                    </p>
                  </div>
                  {(t.status === "unmatched" || t.status === "partial") && <Resolve txn={t} students={students} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
