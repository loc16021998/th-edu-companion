"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, ChartLine, CircleCheck, ClipboardList, Eye, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { generateIntervention } from "../actions";
import type { SavedNotes, StudentInsight } from "../queries";
import type { Severity } from "../risk";
import { Report360Sheet } from "./report360-sheet";

type Level = Severity | "ok";

/** Màu + biểu tượng + chữ cho từng mức (không dựa vào màu đơn thuần). */
export const LEVEL_STYLE: Record<Level, { label: string; short: string; icon: typeof AlertOctagon; badge: string; tile: string; dot: string }> = {
  high: { label: "Cần can thiệp ngay", short: "Cao", icon: AlertOctagon, badge: "bg-rose-100 text-rose-800 ring-rose-200", tile: "bg-rose-50 ring-rose-200 text-rose-900", dot: "bg-rose-500" },
  medium: { label: "Cần lưu ý", short: "Lưu ý", icon: AlertTriangle, badge: "bg-orange-100 text-orange-800 ring-orange-200", tile: "bg-orange-50 ring-orange-200 text-orange-900", dot: "bg-orange-500" },
  watch: { label: "Theo dõi thêm", short: "Theo dõi", icon: Eye, badge: "bg-yellow-100 text-yellow-900 ring-yellow-200", tile: "bg-yellow-50 ring-yellow-200 text-yellow-900", dot: "bg-yellow-500" },
  ok: { label: "Ổn định", short: "Ổn định", icon: CircleCheck, badge: "bg-emerald-100 text-emerald-800 ring-emerald-200", tile: "bg-emerald-50 ring-emerald-200 text-emerald-900", dot: "bg-emerald-500" },
};
const LEVELS: Level[] = ["high", "medium", "watch", "ok"];

export type BoardItem = StudentInsight & { saved: SavedNotes; fingerprint: string };

function StudentCard({ item, mode, analyticsBase }: { item: BoardItem; mode: "teacher" | "admin"; analyticsBase: string }) {
  const router = useRouter();
  const { student, risk, tips } = item;
  const style = LEVEL_STYLE[risk.level];
  const savedCurrent = item.saved.intervention && item.saved.intervention.fingerprint === item.fingerprint ? item.saved.intervention.content : null;
  const [suggestion, setSuggestion] = useState<{ content: string; notice: string | null; ai: boolean } | null>(savedCurrent ? { content: savedCurrent, notice: null, ai: true } : null);
  const [pending, startTransition] = useTransition();
  const [reportOpen, setReportOpen] = useState(false);
  const Icon = style.icon;

  function suggest(refresh: boolean) {
    startTransition(async () => {
      try {
        const res = await generateIntervention(student.id, refresh);
        if (!res.ok) return toast.error("Chưa gợi ý được", res.error);
        setSuggestion({ content: res.data.content, notice: res.data.notice, ai: res.data.source !== "template" });
        if (res.data.source === "ai") router.refresh();
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại.");
      }
    });
  }

  return (
    <article className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-label={`${student.fullName} — ${style.label}`}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold ring-1", style.badge)} aria-hidden>
          {student.childName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-bold">{student.fullName}</h3>
          <p className="text-xs text-muted-foreground">Lớp {student.className}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1", style.badge)}>
          <Icon className="size-3.5" aria-hidden /> {style.label}
        </span>
      </div>

      {risk.signals.length > 0 && (
        <ul className="space-y-1.5">
          {risk.signals.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", LEVEL_STYLE[s.severity].dot)} aria-hidden />
              <span className="min-w-0">
                <span className={cn("mr-1 rounded px-1.5 py-0.5 text-[11px] font-bold ring-1", LEVEL_STYLE[s.severity].badge)}>{LEVEL_STYLE[s.severity].short}</span>
                <b className="font-semibold">{s.title}</b>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {risk.signals.length > 0 && (
        <div className="space-y-2 rounded-xl bg-violet-50/70 p-3 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:ring-violet-900">
          <p className="flex items-center gap-1.5 text-xs font-bold text-violet-800 dark:text-violet-200">
            <Sparkles className="size-3.5" aria-hidden /> Gợi ý can thiệp sư phạm {suggestion?.ai ? "(AI)" : ""}
          </p>
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" /> AI đang phân tích dữ liệu của bé...
            </p>
          ) : suggestion ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{suggestion.content}</p>
              {suggestion.notice && <p className="text-xs text-amber-800">{suggestion.notice}</p>}
            </>
          ) : (
            <ul className="space-y-1 text-sm">
              {tips.map((t, i) => (
                <li key={i} className="flex gap-1.5">
                  <span aria-hidden>•</span>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {risk.signals.length > 0 && (
          <Button type="button" size="sm" className="rounded-lg bg-violet-600 text-white hover:bg-violet-700" disabled={pending} onClick={() => suggest(Boolean(suggestion?.ai))}>
            <Sparkles className="size-4" /> {suggestion?.ai ? "Gợi ý lại bằng AI" : "AI gợi ý can thiệp"}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setReportOpen(true)}>
          <ClipboardList className="size-4" /> Nhận xét 360°{item.saved.report360?.sentAt ? " · đã gửi" : item.saved.report360 ? " · có nháp" : ""}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-lg" asChild>
          <Link href={`${analyticsBase}?${new URLSearchParams({ class: student.classKey, student: student.id })}`}>
            <ChartLine className="size-4" /> Biểu đồ chi tiết
          </Link>
        </Button>
      </div>

      {reportOpen && (
        <Report360Sheet
          open={reportOpen}
          onOpenChange={setReportOpen}
          student={{ id: student.id, childName: student.childName, fullName: student.fullName }}
          saved={item.saved.report360}
          canSend={mode === "teacher"}
        />
      )}
    </article>
  );
}

/**
 * Bảng "Cảnh báo sớm": thẻ tổng hợp theo mức (bấm để lọc), lọc theo lớp, danh sách bé cần lưu ý (nặng nhất lên đầu)
 * với dấu hiệu cụ thể + gợi ý can thiệp + Nhận xét 360°.
 */
export function InsightsBoard({ items, classes, mode, analyticsBase }: { items: BoardItem[]; classes: { key: string; label: string }[]; mode: "teacher" | "admin"; analyticsBase: string }) {
  const [classKey, setClassKey] = useState<string>("all");
  const [levels, setLevels] = useState<Level[]>(["high", "medium", "watch"]);
  const inClass = classKey === "all" ? items : items.filter((i) => i.student.classKey === classKey);
  const count = (l: Level) => inClass.filter((i) => i.risk.level === l).length;
  const shown = inClass.filter((i) => levels.includes(i.risk.level));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Lọc theo mức cảnh báo">
        {LEVELS.map((l) => {
          const s = LEVEL_STYLE[l];
          const Icon = s.icon;
          const on = levels.includes(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => setLevels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))}
              className={cn("rounded-2xl p-3 text-left ring-1 transition-opacity", s.tile, !on && "opacity-50")}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Icon className="size-4" aria-hidden /> {s.label}
              </span>
              <span className="block text-2xl font-extrabold tabular-nums">{count(l)}</span>
            </button>
          );
        })}
      </div>

      {classes.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Lọc theo lớp">
          {[{ key: "all", label: "Tất cả lớp" }, ...classes].map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={classKey === c.key}
              onClick={() => setClassKey(c.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1",
                classKey === c.key ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {levels.length === 0 ? "Chọn ít nhất 1 mức ở trên để xem danh sách." : "Không có học sinh nào ở mức đang chọn 🎉"}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((item) => (
            <StudentCard key={item.student.id} item={item} mode={mode} analyticsBase={analyticsBase} />
          ))}
        </div>
      )}
    </div>
  );
}
