"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Info, Loader2, Save, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateMonthlySummaryDraft, saveMonthlySummary } from "../actions";
import type { MonthlySummary } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const MAX = 6000;

/**
 * Giáo viên: tạo bản nháp tổng kết tháng (AI / mẫu) → xem lại, chỉnh sửa → "Gửi cho phụ huynh".
 * Phụ huynh chỉ thấy bản đã gửi; gửi lại bản đã sửa → phụ huynh nhận thông báo mới.
 */
export function SummaryEditor({
  studentId,
  studentName,
  month,
  monthLabel,
  existing,
  available,
}: {
  studentId: string;
  studentName: string;
  month: string;
  monthLabel: string;
  existing: MonthlySummary | null;
  available: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState(existing?.content ?? "");
  const [aiGenerated, setAiGenerated] = useState(existing?.ai_generated ?? false);
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const sent = existing?.status === "sent";
  const dirty = content !== (existing?.content ?? "");
  const busy = generating || saving;

  async function generate() {
    if (content.trim() && !(await confirmSheet({ title: "Tạo bản nháp mới?", description: "Bản nháp mới sẽ thay nội dung đang soạn.", confirmLabel: "Tạo bản nháp" }))) return;
    setMessage(null);
    startGenerating(async () => {
      const res = await generateMonthlySummaryDraft(studentId, month);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      setContent(res.data.content);
      setAiGenerated(res.data.aiGenerated);
      setMessage(
        res.data.notice
          ? { tone: "info", text: res.data.notice }
          : { tone: "info", text: "AI đã soạn bản nháp — thầy/cô đọc kỹ, chỉnh sửa cho phù hợp rồi bấm “Gửi cho phụ huynh”." },
      );
    });
  }

  async function save(send: boolean) {
    if (send && !(await confirmSheet({ title: `Gửi tổng kết ${monthLabel} cho phụ huynh bé ${studentName}?`, description: "Phụ huynh sẽ nhận thông báo ngay.", confirmLabel: "Gửi phụ huynh" }))) return;
    setMessage(null);
    startSaving(async () => {
      const res = await saveMonthlySummary({ studentId, month, content, send, aiGenerated });
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      setMessage({ tone: "ok", text: send ? "Đã gửi cho phụ huynh — phụ huynh nhận thông báo 🔔." : "Đã lưu bản nháp (phụ huynh chưa thấy)." });
      router.refresh();
    });
  }

  if (!available) {
    return (
      <section className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-amber-200 print:hidden">
        <p className="font-bold">Chưa bật được tổng kết tháng</p>
        <p className="text-muted-foreground">
          Database chưa có bảng tổng kết tháng — nhờ quản trị viên chạy file{" "}
          <span className="font-mono text-xs font-semibold text-foreground">supabase/apply-monthly-summaries.sql</span> trong Supabase SQL Editor.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Sparkles className="size-5 text-violet-600" /> Nhận xét tổng kết {monthLabel}
        </h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold ring-1",
            sent ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : existing ? "bg-amber-100 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200",
          )}
        >
          {sent ? "Đã gửi phụ huynh" : existing ? "Bản nháp" : "Chưa có"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={generate} disabled={busy}>
          {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {generating ? "Đang soạn..." : content.trim() ? "Tạo lại bản nháp bằng AI" : "Tạo bản nháp bằng AI"}
        </Button>
        <span className="text-xs text-muted-foreground">Gom điểm danh + sổ liên lạc 30 ngày gần nhất của tháng.</span>
      </div>

      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          maxLength={MAX}
          placeholder="Bấm “Tạo bản nháp bằng AI” để có nội dung gợi ý, hoặc tự viết nhận xét tổng kết tháng cho phụ huynh..."
          aria-label="Nội dung nhận xét tổng kết tháng"
          className="min-h-56 w-full resize-y rounded-xl border border-input bg-background p-3 pb-6 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm print:min-h-0 print:border-0 print:p-0 print:shadow-none"
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-muted-foreground print:hidden">
          {content.length}/{MAX}
        </span>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl p-3 text-sm font-medium print:hidden",
            message.tone === "ok" && "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
            message.tone === "error" && "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
            message.tone === "info" && "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
          )}
        >
          {message.tone === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : message.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {!sent && (
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => save(false)} disabled={busy || content.trim().length < 20}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Lưu nháp
          </Button>
        )}
        <Button type="button" className="h-10 flex-1 rounded-xl sm:flex-none" onClick={() => save(true)} disabled={busy || content.trim().length < 20 || (sent && !dirty)}>
          {saving ? <Loader2 className="animate-spin" /> : <Send />}
          {sent ? (dirty ? "Cập nhật & gửi lại cho phụ huynh" : "Đã gửi") : "Gửi cho phụ huynh"}
        </Button>
      </div>
      {aiGenerated && <p className="text-xs text-muted-foreground print:hidden">Bản nháp do AI soạn — giáo viên chịu trách nhiệm nội dung trước khi gửi.</p>}
    </section>
  );
}
