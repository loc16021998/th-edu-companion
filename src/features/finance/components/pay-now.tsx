"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatVND } from "@/lib/utils";
import { buildVietQR, feeTransferContent } from "@/lib/vietqr";

export type PayInfo = { bankBin: string; bankName: string; accountNo: string; accountName: string };

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className={cn("break-all text-sm font-bold", mono && "font-mono tracking-wide")}>{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 rounded-lg p-2 text-primary hover:bg-background"
        aria-label={`Sao chép ${label}`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/**
 * "Thanh toán ngay": mã VietQR động (đúng số tiền còn thiếu + nội dung "[Mã HS] - [Họ tên] - [Tháng]") —
 * quét bằng app ngân hàng là điền sẵn mọi thông tin. Mã sinh ngay trên máy, không gửi dữ liệu ra ngoài.
 */
export function PayNow({
  fee,
  student,
  pay,
}: {
  fee: { title: string; remaining: number; month: string | null };
  student: { code: string | null; name: string };
  pay: PayInfo | null;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const content = feeTransferContent(student.code, student.name, fee.month);

  useEffect(() => {
    if (!open || !pay || qr) return;
    let alive = true;
    const payload = buildVietQR({ bin: pay.bankBin, accountNo: pay.accountNo, amount: fee.remaining, content });
    void import("qrcode").then((QR) =>
      QR.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 560, color: { dark: "#0f172a", light: "#ffffff" } }).then((url) => alive && setQr(url)),
    );
    return () => {
      alive = false;
    };
  }, [open, pay, qr, fee.remaining, content]);


  return (
    <>
      <Button type="button" className="mt-3 h-10 w-full rounded-xl" onClick={() => setOpen(true)}>
        <QrCode /> Thanh toán ngay · {formatVND(fee.remaining)}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
            <SheetHeader>
              <SheetTitle>Thanh toán học phí</SheetTitle>
              <SheetDescription>{fee.title}</SheetDescription>
            </SheetHeader>

            {!pay ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
                Trung tâm chưa cấu hình tài khoản nhận học phí. Bố mẹ vui lòng liên hệ văn phòng cơ sở hoặc nhắn cô chủ nhiệm.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="mx-auto flex aspect-square w-full max-w-[18rem] items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-border">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh QR sinh tại chỗ (data URL)
                    <img src={qr} alt={`Mã VietQR chuyển ${formatVND(fee.remaining)} tới ${pay.bankName}`} className="size-full" />
                  ) : (
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-center text-sm">
                  Mở app ngân hàng → <b>Quét QR</b> → kiểm tra rồi xác nhận chuyển <b className="text-primary">{formatVND(fee.remaining)}</b>.
                </p>
                <div className="space-y-1.5">
                  <CopyRow label="Ngân hàng" value={pay.bankName} />
                  <CopyRow label="Số tài khoản" value={pay.accountNo} mono />
                  <CopyRow label="Chủ tài khoản" value={pay.accountName} />
                  <CopyRow label="Số tiền" value={String(fee.remaining)} mono />
                  <CopyRow label="Nội dung chuyển khoản (giữ nguyên để trung tâm đối soát)" value={content} mono />
                </div>
                {qr && (
                  <a
                    href={qr}
                    download={`hoc-phi-${content.replace(/\s+/g, "-").toLowerCase()}.png`}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary ring-1 ring-border hover:bg-muted"
                  >
                    <Download className="size-4" /> Lưu ảnh QR
                  </a>
                )}
                <p className="text-xs text-muted-foreground">
                  Sau khi chuyển khoản, trạng thái được cập nhật khi trung tâm xác nhận (thường trong ngày làm việc).
                </p>
              </div>
            )}
        </SheetContent>
      </Sheet>
    </>
  );
}
