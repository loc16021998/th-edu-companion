import { EyeOff, MessageSquareReply, PhoneCall } from "lucide-react";
import { relativeTime } from "@/features/notifications/format";
import { cn, givenName } from "@/lib/utils";
import { FEEDBACK_KINDS, FEEDBACK_STATUS, FEEDBACK_STATUS_PARENT, feedbackCategoryLabel, type FeedbackKind } from "../constants";
import type { MyFeedback } from "../queries";

/** Ý kiến phụ huynh đã gửi + trạng thái xử lý + trả lời của nhà trường. */
export function FeedbackHistory({ items }: { items: MyFeedback[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Anh/chị chưa gửi ý kiến nào.
      </p>
    );
  }
  const now = new Date();

  return (
    <ul className="space-y-3">
      {items.map((f) => {
        const kind = FEEDBACK_KINDS[f.kind as FeedbackKind] ?? FEEDBACK_KINDS.gop_y;
        return (
          <li key={f.id} className="space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
            <div className="flex items-start justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-muted-foreground">
                <span>
                  {kind.emoji} {kind.label} · {feedbackCategoryLabel(f.category)}
                </span>
                {f.student && <span>· Bé {givenName(f.student.full_name)}</span>}
                <span>· {relativeTime(f.created_at, now)}</span>
                {f.is_anonymous && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-200">
                    <EyeOff className="size-3" /> Ẩn danh
                  </span>
                )}
                {f.wants_callback && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">
                    <PhoneCall className="size-3" /> Chờ gọi lại
                  </span>
                )}
              </p>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", FEEDBACK_STATUS[f.status].badge)}>
                {FEEDBACK_STATUS_PARENT[f.status]}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{f.content}</p>
            {f.admin_reply && (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
                  <MessageSquareReply className="size-4" /> Ban Giám đốc trả lời
                  {f.replied_at && <span className="font-medium opacity-70">· {relativeTime(f.replied_at, now)}</span>}
                </p>
                <p className="whitespace-pre-wrap break-words">{f.admin_reply}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
