"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { draftAnnouncement, type DraftResult } from "../ai-content";
import { ANNOUNCEMENT_STYLES, type AnnouncementDraft } from "../ai-content-shared";

/**
 * "✨ AI Viết thông báo chuẩn": quản trị nhập ý chính → 3 văn phong (ấm áp / trang trọng / đăng Zalo-Facebook).
 * "Dùng bản này" điền vào Tiêu đề + Nội dung của form; "Sao chép" để dán lên nhóm Zalo / Facebook.
 */
export function AnnouncementAiHelper({
  points,
  onPointsChange,
  categoryLabel,
  audienceLabel,
  onUse,
}: {
  points: string;
  onPointsChange: (text: string) => void;
  categoryLabel: string;
  audienceLabel: string;
  onUse: (draft: AnnouncementDraft) => void;
}) {
  const [result, setResult] = useState<DraftResult | null>(null);
  const [used, setUsed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      try {
        const res = await draftAnnouncement({ points, categoryLabel, audienceLabel });
        if (!res.ok) return toast.error("Chưa viết được thông báo", res.error);
        setResult(res.data);
        setUsed(null);
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại.");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-gradient-to-br from-violet-50 to-sky-50 p-3 ring-1 ring-violet-200 dark:from-violet-950/40 dark:to-sky-950/30 dark:ring-violet-900" aria-labelledby="ai-announce-title">
      <div>
        <h3 id="ai-announce-title" className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-200">
          <Sparkles className="size-4" aria-hidden /> Trợ lý AI viết thông báo
        </h3>
        <p className="text-xs text-muted-foreground">Nhập vài ý chính → AI viết 3 văn phong, chọn bản ưng ý rồi sửa tuỳ thích.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="ai-points" className="text-sm font-semibold">
          Ý chính
        </label>
        <Textarea
          id="ai-points"
          value={points}
          onChange={(e) => onPointsChange(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={"VD:\n- Nghỉ lễ 30/4 – 1/5\n- Học bù vào Chủ nhật 4/5\n- Chúc các gia đình kỳ nghỉ vui vẻ"}
          className="rounded-xl bg-background text-base md:text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Gửi tới: <b>{audienceLabel}</b> · Loại: <b>{categoryLabel}</b> (chọn ở bên dưới)
        </p>
      </div>
      <Button
        type="button"
        onClick={generate}
        disabled={pending || points.trim().length < 5}
        className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 text-base font-bold text-white hover:from-violet-700 hover:to-sky-700"
      >
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "AI đang viết thông báo..." : result ? "✨ Viết lại" : "✨ AI Viết thông báo chuẩn"}
      </Button>

      {result && !pending && (
        <div className="space-y-2" aria-live="polite">
          {result.notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{result.notice}</p>}
          <div className="grid gap-2 lg:grid-cols-3">
            {result.drafts.map((d) => {
              const s = ANNOUNCEMENT_STYLES[d.style];
              return (
                <article key={d.style} className={cn("flex flex-col gap-2 rounded-xl bg-background p-3 ring-1", used === d.style ? "ring-2 ring-primary" : "ring-border")} aria-label={`Văn phong ${s.label}`}>
                  <p className="text-xs font-bold text-violet-800 dark:text-violet-200">
                    {s.emoji} {s.label} <span className="font-normal text-muted-foreground">· {s.hint}</span>
                  </p>
                  <p className="break-words font-bold">{d.title}</p>
                  <p className="max-h-56 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{d.body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => {
                        onUse(d);
                        setUsed(d.style);
                        document.getElementById("an-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      <Check className="size-4" /> Dùng bản này
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() =>
                        void navigator.clipboard?.writeText(`${d.title}\n\n${d.body}`).then(
                          () => toast.success("Đã sao chép", d.style === "social" ? "Dán vào nhóm Zalo / Facebook của trung tâm." : undefined),
                          () => toast.error("Không sao chép được"),
                        )
                      }
                    >
                      <Copy className="size-4" /> Sao chép
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
