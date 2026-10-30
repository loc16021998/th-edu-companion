"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, CircleDot, EyeOff, Inbox, Loader2, Phone, PhoneCall, RotateCcw, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { cn, givenName } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { replyFeedback } from "../actions";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  FEEDBACK_STATUS,
  feedbackCategoryLabel,
  type FeedbackCategory,
  type FeedbackKind,
} from "../constants";
import type { AdminFeedback } from "../queries";
import { toast } from "@/components/ui/toast";

type Status = Enums<"feedback_status">;

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const localPhone = (p: string) => p.replace(/^\+?84/, "0");

function FeedbackItem({ item }: { item: AdminFeedback }) {
  const [reply, setReply] = useState(item.admin_reply ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const kind = FEEDBACK_KINDS[item.kind as FeedbackKind] ?? FEEDBACK_KINDS.gop_y;
  const phone = item.contact_phone ?? item.parent?.phone ?? null;
  const replyChanged = reply.trim() !== (item.admin_reply ?? "").trim();

  function save(status: Status, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await replyFeedback(item.id, reply, status);
      setMessage(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
      if (res.ok) toast.success(okText);
      else toast.error("Chưa lưu được", res.error);
    });
  }

  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border",
        item.status === "new" && "ring-2 ring-sky-200",
        item.wants_callback && item.status !== "resolved" && "ring-2 ring-amber-300",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          {item.is_anonymous ? (
            <p className="flex items-center gap-1.5 font-semibold text-violet-700">
              <EyeOff className="size-4" /> Phụ huynh ẩn danh
            </p>
          ) : (
            <p className="font-semibold">
              {item.contact_name || item.parent?.full_name || "Phụ huynh"}
              {item.student && (
                <span className="font-medium text-muted-foreground">
                  {" "}
                  · PH bé {givenName(item.student.full_name)} (Lớp {item.student.class_name})
                </span>
              )}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {kind.emoji} {kind.label}
            </span>
            <span>· {feedbackCategoryLabel(item.category)}</span>
            <span>· {dateFmt.format(new Date(item.created_at))}</span>
            {phone && (
              <a href={`tel:${localPhone(phone)}`} className="flex items-center gap-1 font-semibold text-primary">
                <Phone className="size-3" /> {localPhone(phone)}
              </a>
            )}
            {item.wants_callback && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                <PhoneCall className="size-3" /> Muốn được gọi lại
              </span>
            )}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", FEEDBACK_STATUS[item.status].badge)}>{FEEDBACK_STATUS[item.status].label}</span>
      </div>

      <p className="whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm">{item.content}</p>

      <div className="space-y-2">
        <label htmlFor={`reply-${item.id}`} className="text-xs font-semibold text-muted-foreground">
          Trả lời phụ huynh {item.is_anonymous && "(vẫn tới đúng người gửi, nhà trường không biết là ai)"}
        </label>
        <textarea
          id={`reply-${item.id}`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          maxLength={FEEDBACK_MAX}
          placeholder="Nội dung trả lời — phụ huynh nhận thông báo 🔔 và đọc trong mục Góp ý & hỗ trợ..."
          className={cn(fieldClass, "h-auto resize-y py-2.5")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="h-9 rounded-lg"
            disabled={pending || !reply.trim()}
            onClick={() => save("resolved", "Đã gửi trả lời & đánh dấu hoàn tất — phụ huynh đã nhận thông báo.")}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Trả lời & hoàn tất
          </Button>
          {replyChanged && reply.trim() && (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg"
              disabled={pending}
              onClick={() => save("in_progress", "Đã gửi trả lời — góp ý vẫn ở trạng thái đang giải quyết.")}
            >
              Trả lời, vẫn đang giải quyết
            </Button>
          )}
          {item.status === "new" && (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg"
              disabled={pending}
              onClick={() => save("in_progress", "Đã tiếp nhận — phụ huynh được báo góp ý đang được giải quyết.")}
            >
              <CircleDot /> Tiếp nhận
            </Button>
          )}
          {item.status === "in_progress" && !replyChanged && (
            <Button type="button" variant="outline" className="h-9 rounded-lg" disabled={pending} onClick={() => save("resolved", "Đã đánh dấu hoàn tất.")}>
              <CheckCircle2 /> Hoàn tất
            </Button>
          )}
          {item.status === "resolved" && !replyChanged && (
            <Button type="button" variant="ghost" className="h-9 rounded-lg" disabled={pending} onClick={() => save("in_progress", "Đã mở lại góp ý.")}>
              <RotateCcw /> Mở lại
            </Button>
          )}
        </div>
        {message && <p className={cn("text-xs font-medium", message.ok ? "text-emerald-700" : "text-destructive")}>{message.text}</p>}
      </div>
    </li>
  );
}

const STATUS_CARDS: { value: Status; icon: typeof Inbox; tone: string }[] = [
  { value: "new", icon: Inbox, tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  { value: "in_progress", icon: CircleDot, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  { value: "resolved", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
];

export function AdminFeedbackManager({ items }: { items: AdminFeedback[] }) {
  const [status, setStatus] = useState<"all" | Status>("new");
  const [kind, setKind] = useState<"all" | FeedbackKind>("all");
  const [category, setCategory] = useState<"all" | FeedbackCategory | "other">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Status, number> = { new: 0, in_progress: 0, resolved: 0 };
    for (const f of items) c[f.status]++;
    return c;
  }, [items]);
  const callbacks = items.filter((f) => f.wants_callback && f.status !== "resolved").length;

  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (f) =>
      (status === "all" || f.status === status) &&
      (kind === "all" || f.kind === kind) &&
      (category === "all" || (category === "other" ? !(f.category in FEEDBACK_CATEGORIES) || f.category === "khac" : f.category === category)) &&
      (!q ||
        f.content.toLowerCase().includes(q) ||
        (f.contact_name ?? f.parent?.full_name ?? "").toLowerCase().includes(q) ||
        (f.student?.full_name ?? "").toLowerCase().includes(q) ||
        (f.contact_phone ?? f.parent?.phone ?? "").includes(q.replace(/^0/, ""))),
  );
  const select = "h-9 rounded-lg border bg-background px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {STATUS_CARDS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setStatus(status === c.value ? "all" : c.value)}
            aria-pressed={status === c.value}
            className={cn("rounded-2xl p-3 text-left ring-1 transition-shadow", c.tone, status === c.value && "shadow-md ring-2")}
          >
            <c.icon className="size-5" />
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{counts[c.value]}</p>
            <p className="text-xs font-semibold">{FEEDBACK_STATUS[c.value].label}</p>
          </button>
        ))}
      </div>
      {callbacks > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          <PhoneCall className="size-4" /> {callbacks} phụ huynh đang chờ được gọi điện lại
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nội dung, tên, SĐT..."
            className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm"
            aria-label="Tìm góp ý"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select} aria-label="Trạng thái">
          <option value="all">Mọi trạng thái ({items.length})</option>
          {STATUS_CARDS.map((c) => (
            <option key={c.value} value={c.value}>
              {FEEDBACK_STATUS[c.value].label} ({counts[c.value]})
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={select} aria-label="Loại">
          <option value="all">Mọi loại</option>
          {(Object.entries(FEEDBACK_KINDS) as [FeedbackKind, (typeof FEEDBACK_KINDS)[FeedbackKind]][]).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={select} aria-label="Chủ đề">
          <option value="all">Mọi chủ đề</option>
          {(Object.entries(FEEDBACK_CATEGORIES) as [FeedbackCategory, string][])
            .filter(([k]) => k !== "khac")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          <option value="other">Khác</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Không có góp ý nào khớp bộ lọc.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((f) => (
            <FeedbackItem key={f.id} item={f} />
          ))}
        </ul>
      )}
    </div>
  );
}
