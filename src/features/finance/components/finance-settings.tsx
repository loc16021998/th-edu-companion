"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CircleAlert, CircleCheck, Landmark, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/shared/form-field";
import { fullDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { VN_BANKS, buildVietQR, toTransferText } from "@/lib/vietqr";
import { runFeeReminders, savePaymentConfig } from "../actions";
import type { PaymentConfig, ReminderRun } from "../queries";

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("flex items-start gap-2 rounded-xl p-3 text-sm font-medium", msg.ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-destructive/10 text-destructive")}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      {msg.text}
    </p>
  );
}

/** Tài khoản nhận học phí — dùng để sinh mã VietQR cho phụ huynh (có QR xem thử). */
export function PaymentConfigForm({ config }: { config: PaymentConfig | null }) {
  const router = useRouter();
  const [bin, setBin] = useState(config?.bankBin ?? "");
  const [accountNo, setAccountNo] = useState(config?.accountNo ?? "");
  const [accountName, setAccountName] = useState(config?.accountName ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bank = VN_BANKS.find((b) => b.bin === bin);

  // QR xem thử 10.000đ — admin quét bằng app ngân hàng để chắc chắn đúng tài khoản trước khi phụ huynh dùng
  useEffect(() => {
    if (!bank || accountNo.replace(/\s/g, "").length < 4) return setPreview(null);
    let alive = true;
    const payload = buildVietQR({ bin, accountNo: accountNo.replace(/\s/g, ""), amount: 10000, content: "TH EDU KIEM TRA QR" });
    void import("qrcode").then((QR) => QR.toDataURL(payload, { margin: 1, width: 280 }).then((u) => alive && setPreview(u)));
    return () => {
      alive = false;
    };
  }, [bank, bin, accountNo]);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await savePaymentConfig({ bankBin: bin, bankName: bank?.name ?? "", accountNo, accountName });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: "Đã lưu tài khoản nhận học phí. Phụ huynh thấy nút “Thanh toán ngay” với mã VietQR của tài khoản này." });
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Landmark className="size-5 text-primary" /> Tài khoản nhận học phí (VietQR)
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
        <div className="space-y-3">
          <Field label="Ngân hàng" htmlFor="pc-bank">
            <select id="pc-bank" value={bin} onChange={(e) => setBin(e.target.value)} className={fieldClass}>
              <option value="" disabled>
                — Chọn ngân hàng —
              </option>
              {VN_BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số tài khoản" htmlFor="pc-no">
            <input id="pc-no" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} inputMode="numeric" className={cn(fieldClass, "font-mono")} />
          </Field>
          <Field label="Tên chủ tài khoản (không dấu)" htmlFor="pc-name" hint={accountName ? `Hiển thị: ${toTransferText(accountName)}` : undefined}>
            <input id="pc-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="VD: TRUNG TAM GIAO DUC TH EDU" className={fieldClass} />
          </Field>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex size-44 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-border">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR xem thử (data URL)
              <img src={preview} alt="QR xem thử 10.000đ" className="size-full" />
            ) : (
              <span className="px-3 text-center text-xs text-muted-foreground">Chọn ngân hàng + nhập số tài khoản để xem QR thử</span>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">Quét thử bằng app ngân hàng (10.000đ) để kiểm tra đúng tài khoản</p>
        </div>
      </div>
      <Message msg={msg} />
      <Button type="button" className="h-11 rounded-xl" onClick={save} disabled={pending || !bin || !accountNo || !accountName}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu tài khoản
      </Button>
      {config && <p className="text-xs text-muted-foreground">Cập nhật lần cuối: {new Date(config.updatedAt).toLocaleString("vi-VN")}</p>}
    </section>
  );
}

/** Nhắc học phí tự động: giải thích lịch, nút chạy ngay, lịch sử các lần chạy. */
export function ReminderPanel({ runs, available, preview }: { runs: ReminderRun[]; available: boolean; preview: { dueSoon: number; overdue: number } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMsg(null);
    startTransition(async () => {
      const res = await runFeeReminders();
      setMsg(res.ok ? { ok: true, text: res.data.message } : { ok: false, text: res.error });
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <BellRing className="size-5 text-amber-600" /> Nhắc học phí tự động
      </h2>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>
          • <b className="text-foreground">Trước hạn 3 ngày</b>: nhắc nhẹ kèm hướng dẫn thanh toán bằng mã QR.
        </li>
        <li>
          • <b className="text-foreground">Khi quá hạn</b>: nhắc vào ngày đầu quá hạn, sau đó mỗi 7 ngày (tối đa 4 lần) — lời lẽ nhẹ nhàng, có số điện thoại hỗ trợ.
        </li>
        <li>• Tự chạy lúc 8:00 sáng mỗi ngày; phụ huynh nhận trên chuông + thông báo đẩy. Mỗi khoản chỉ nhắc 1 lần / ngày.</li>
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-2xl font-extrabold tabular-nums text-amber-800">{preview.dueSoon}</p>
          <p className="text-xs font-semibold text-amber-900/80">khoản đến hạn sau 3 ngày</p>
        </div>
        <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
          <p className="text-2xl font-extrabold tabular-nums text-rose-700">{preview.overdue}</p>
          <p className="text-xs font-semibold text-rose-900/80">khoản đang quá hạn</p>
        </div>
      </div>
      {!available && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Chạy file <code>supabase/apply-finance.sql</code> để bật nhắc học phí tự động.
        </p>
      )}
      <Message msg={msg} />
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={run} disabled={pending || !available}>
        {pending ? <Loader2 className="animate-spin" /> : <BellRing />} Gửi nhắc ngay
      </Button>
      {runs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Các lần chạy gần đây</p>
          <ul className="divide-y rounded-xl ring-1 ring-border">
            {runs.map((r) => (
              <li key={r.createdAt} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {fullDate(r.runDate)} <span className="text-xs text-muted-foreground">· {r.auto ? "tự động" : "bấm tay"}</span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.dueSoon} sắp đến hạn · {r.overdue} quá hạn
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
