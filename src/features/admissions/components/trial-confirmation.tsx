"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { markTrialConfirmed, sendTrialConfirmation } from "../actions";
import { CONFIRMATION_STATUS, localPhone, type ConfirmationStatus } from "../constants";

/**
 * Tin xác nhận lịch học thử: gửi tự động (Zalo ZNS / SMS qua webhook) hoặc sao chép / mở SMS / mở Zalo để gửi tay,
 * rồi đánh dấu "Đã báo phụ huynh".
 */
export function TrialConfirmation({ trialId, phone, text, status }: { trialId: string; phone: string; text: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const conf = CONFIRMATION_STATUS[status as ConfirmationStatus] ?? CONFIRMATION_STATUS.pending;
  const local = localPhone(phone);
  const done = status === "sent" || status === "manual";

  const sendAuto = () =>
    startTransition(async () => {
      const res = await sendTrialConfirmation(trialId);
      if (!res.ok) return toast.error("Chưa gửi được", res.error);
      if (res.data.sent) toast.success(res.data.message);
      else toast.info(res.data.message);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Đã sao chép tin nhắn", "Dán vào Zalo / tin nhắn gửi phụ huynh.");
    } catch {
      toast.error("Không sao chép được", "Bôi đen nội dung tin nhắn để sao chép.");
    }
  };

  const markManual = () =>
    startTransition(async () => {
      const res = await markTrialConfirmed(trialId);
      if (res.ok) toast.success("Đã đánh dấu đã báo phụ huynh");
      else toast.error("Chưa lưu được", res.error);
    });

  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tin xác nhận lịch hẹn</p>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", conf.badge)}>{conf.label}</span>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-card p-2.5 text-sm ring-1 ring-border">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-9 rounded-lg" disabled={pending} onClick={sendAuto}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} {done ? "Gửi lại tự động" : "Gửi tự động"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg" onClick={copy}>
          {copied ? <Check /> : <Copy />} Sao chép
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-9 rounded-lg">
          <a href={`sms:${local}?&body=${encodeURIComponent(text)}`}>
            <MessageSquareText /> Gửi SMS
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-9 rounded-lg">
          <a href={`https://zalo.me/${local}`} target="_blank" rel="noopener noreferrer">
            Mở Zalo
          </a>
        </Button>
        {!done && (
          <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-lg text-emerald-700" disabled={pending} onClick={markManual}>
            <Check /> Đã báo phụ huynh
          </Button>
        )}
      </div>
    </div>
  );
}
