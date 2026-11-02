"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, Lock, PencilLine, QrCode, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatVND } from "@/lib/utils";
import { MAX_CONTENT, buildVietQR, customTransferContent, defaultTransferNote } from "@/lib/vietqr";

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
 * `autoOpen`: mở từ thông báo học phí (?pay=<mã khoản>) → hiện mã QR ngay, không phải tìm khoản rồi bấm.
 */
export function PayNow({
  fee,
  student,
  pay,
  autoOpen = false,
}: {
  fee: { title: string; remaining: number; month: string | null };
  student: { code: string | null; name: string };
  pay: PayInfo | null;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [qr, setQr] = useState<string | null>(null);
  // Phụ huynh tự viết lời ghi; mã học sinh luôn đứng đầu (trung tâm tự đối soát tiền về theo mã này)
  const suggested = defaultTransferNote(student.code, student.name, fee.month);
  const [note, setNote] = useState(suggested);
  const content = customTransferContent(student.code, note);
  const codePrefix = student.code ? `${student.code} - ` : "";
  const noteMax = MAX_CONTENT - codePrefix.length;
  // Gõ xong ~0,3 giây mới vẽ lại QR (không vẽ lại theo từng phím)
  const [qrContent, setQrContent] = useState(content);
  useEffect(() => {
    const t = window.setTimeout(() => setQrContent(content), 300);
    return () => window.clearTimeout(t);
  }, [content]);

  useEffect(() => {
    if (!open || !pay) return;
    let alive = true;
    const payload = buildVietQR({ bin: pay.bankBin, accountNo: pay.accountNo, amount: fee.remaining, content: qrContent });
    void import("qrcode").then((QR) =>
      QR.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 560, color: { dark: "#0f172a", light: "#ffffff" } }).then((url) => alive && setQr(url)),
    );
    return () => {
      alive = false;
    };
  }, [open, pay, fee.remaining, qrContent]);
  const updating = content !== qrContent;


  return (
    <>
      <Button type="button" className="mt-3 h-10 w-full rounded-xl" onClick={() => setOpen(true)}>
        <QrCode /> Thanh toán ngay · {formatVND(fee.remaining)}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // Đóng QR mở từ thông báo → bỏ ?pay= khỏi địa chỉ (tải lại trang không tự bật QR nữa)
          if (!o && autoOpen) {
            const url = new URL(window.location.href);
            url.searchParams.delete("pay");
            window.history.replaceState(null, "", url);
          }
        }}
      >
        <SheetContent>
            <SheetHeader>
              <SheetTitle>Thanh toán học phí</SheetTitle>
              <SheetDescription>
                {fee.title} · cần đóng <b className="text-foreground">{formatVND(fee.remaining)}</b>
              </SheetDescription>
            </SheetHeader>

            {!pay ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
                Trung tâm chưa cấu hình tài khoản nhận học phí. Bố mẹ vui lòng liên hệ văn phòng cơ sở hoặc nhắn cô chủ nhiệm.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="relative mx-auto flex aspect-square w-full max-w-[18rem] items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-border">
                  {updating && qr && (
                    <span className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70" aria-live="polite">
                      <Loader2 className="size-7 animate-spin text-primary" />
                      <span className="sr-only">Đang cập nhật mã QR theo nội dung mới</span>
                    </span>
                  )}
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
                {/* Nội dung chuyển khoản do phụ huynh tự viết — mã QR cập nhật theo */}
                <div className="space-y-1.5 rounded-2xl bg-card p-3 ring-1 ring-border">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="transfer-note" className="flex items-center gap-1.5 text-sm font-semibold">
                      <PencilLine className="size-4 text-primary" aria-hidden /> Nội dung chuyển khoản
                    </label>
                    {note !== suggested && (
                      <button
                        type="button"
                        onClick={() => setNote(suggested)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-muted"
                      >
                        <RotateCcw className="size-3.5" aria-hidden /> Dùng nội dung gợi ý
                      </button>
                    )}
                  </div>
                  <div className="flex min-h-11 items-stretch overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    {codePrefix && (
                      <span
                        className="flex shrink-0 items-center gap-1 border-r bg-muted px-2.5 font-mono text-sm font-bold text-muted-foreground"
                        title="Mã học sinh — giữ cố định để trung tâm tự xác nhận khoản tiền"
                      >
                        <Lock className="size-3.5" aria-hidden />
                        {student.code}
                      </span>
                    )}
                    <input
                      id="transfer-note"
                      value={note}
                      maxLength={noteMax + 20}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="VD: Hoc phi thang 11 be An"
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gõ có dấu được — tự đổi sang không dấu.
                    {codePrefix ? " Mã học sinh luôn được giữ ở đầu để trung tâm tự nhận đúng khoản tiền của bé." : ""}
                  </p>
                  <p className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0 break-all">
                      Sẽ gửi: <b className="font-mono">{content}</b>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", content.length >= MAX_CONTENT ? "font-bold text-amber-700" : "text-muted-foreground")}>
                      {content.length}/{MAX_CONTENT}
                    </span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <CopyRow label="Ngân hàng" value={pay.bankName} />
                  <CopyRow label="Số tài khoản" value={pay.accountNo} mono />
                  <CopyRow label="Chủ tài khoản" value={pay.accountName} />
                  <CopyRow label="Số tiền" value={String(fee.remaining)} mono />
                  <CopyRow label="Nội dung chuyển khoản" value={content} mono />
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
