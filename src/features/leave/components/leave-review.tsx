"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/features/notifications/format";
import { decideLeaveRequest } from "../actions";
import { LEAVE_REASONS, LEAVE_STATUS } from "../constants";
import type { LeaveRow } from "../queries";
import { rangeLabel } from "./leave-request-form";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";


/** Thẻ đơn xin nghỉ cho giáo viên / quản trị: Đồng ý · Từ chối (kèm lời nhắn) · Thu hồi đồng ý. */
export function LeaveReviewCard({ item }: { item: LeaveRow }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [askReject, setAskReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function decide(decision: "approved" | "rejected") {
    if (decision === "rejected" && item.status === "approved" && !(await confirmSheet({ title: "Thu hồi đồng ý?", description: "Điểm danh “Nghỉ có phép” của các ngày này sẽ bị gỡ.", confirmLabel: "Thu hồi", tone: "danger" }))) return;
    setError(null);
    startTransition(async () => {
      const res = await decideLeaveRequest({ id: item.id, decision, note });
      if (!res.ok) {
        toast.error("Chưa xử lý được đơn", res.error);
        return setError(res.error);
      }
      toast.success(
        decision === "approved" ? `Đã đồng ý cho ${item.studentName} nghỉ` : `Đã từ chối đơn của ${item.studentName}`,
        decision === "approved" ? "Điểm danh “Nghỉ có phép” được ghi tự động; phụ huynh nhận thông báo." : "Phụ huynh nhận thông báo ngay.",
      );
      setAskReject(false);
      router.refresh();
    });
  }

  return (
    <li id={`l-${item.id}`} className="scroll-mt-24 space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border target:ring-2 target:ring-primary">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {item.studentName} <span className="font-medium text-muted-foreground">· lớp {item.className}</span>
          </p>
          <p className="text-sm">
            Nghỉ <b>{rangeLabel(item.startDate, item.endDate)}</b> · {LEAVE_REASONS[item.reason]?.emoji} {LEAVE_REASONS[item.reason]?.label ?? item.reason}
          </p>
          {item.note && <p className="mt-1 rounded-xl bg-muted/60 p-2.5 text-sm">“{item.note}”</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>
              {item.parentName ?? "Phụ huynh"} gửi {relativeTime(item.createdAt).toLowerCase()}
            </span>
            {item.parentPhone && (
              <a href={`tel:${item.parentPhone}`} className="inline-flex items-center gap-1 font-semibold text-primary">
                <Phone className="size-3" /> {item.parentPhone.replace(/^\+?84/, "0")}
              </a>
            )}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", LEAVE_STATUS[item.status].badge)}>{LEAVE_STATUS[item.status].label}</span>
      </div>

      {item.status === "pending" ? (
        <div className="space-y-2">
          {askReject && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Lời nhắn cho phụ huynh (vd: lý do chưa đồng ý)"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base md:text-sm"
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <Button type="button" className="h-11 flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => decide("approved")} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Xác nhận / Đồng ý
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => (askReject ? decide("rejected") : setAskReject(true))}
              disabled={pending}
            >
              <X /> {askReject ? "Gửi từ chối" : "Từ chối"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.decidedBy && <span>Xử lý bởi {item.decidedBy}</span>}
          {item.decidedAt && <span>· {relativeTime(item.decidedAt)}</span>}
          {item.decisionNote && <span>· “{item.decisionNote}”</span>}
          {item.status === "approved" && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 rounded-lg" onClick={() => decide("rejected")} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Thu hồi
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </li>
  );
}
