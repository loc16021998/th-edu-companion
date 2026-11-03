"use client";

import { useState, useTransition } from "react";
import { Copy, Lightbulb, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { suggestIdeas, type IdeaResult } from "../ai-content";
import { COURSES, COURSE_KEYS, IDEA_KINDS, IDEA_KIND_KEYS, SEASONS, SEASON_KEYS, type Course, type EventIdea, type IdeaKind, type Season } from "../ai-content-shared";

function Chips<K extends string>({ label, keys, value, onChange, text }: { label: string; keys: K[]; value: K; onChange: (k: K) => void; text: (k: K) => string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            onClick={() => onChange(k)}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1", value === k ? "bg-amber-500 text-white ring-amber-500" : "bg-background ring-border hover:bg-muted")}
          >
            {text(k)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ideaText(i: EventIdea) {
  return [`${i.name}`, `Mục tiêu: ${i.goal}`, "Kịch bản:", ...i.plan.map((p, n) => `${n + 1}. ${p}`), `Ưu đãi: ${i.offer}`, "Ý tư vấn phụ huynh:", ...i.talkingPoints.map((t) => `- ${t}`)].join("\n");
}

/**
 * Gợi ý chương trình khuyến mãi / khai giảng, sự kiện ngoại khoá, kịch bản tư vấn tuyển sinh theo mùa.
 * "Tạo thông báo từ ý tưởng này" đưa ý chính sang form đăng thông báo.
 */
export function IdeaGenerator({ defaultSeason, onUseIdea }: { defaultSeason: Season; onUseIdea: (points: string) => void }) {
  const [season, setSeason] = useState<Season>(defaultSeason);
  const [course, setCourse] = useState<Course>("tien_tieu_hoc");
  const [kind, setKind] = useState<IdeaKind>("su_kien");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<IdeaResult | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      try {
        const res = await suggestIdeas({ season, course, kind, note });
        if (!res.ok) return toast.error("Chưa lên được ý tưởng", res.error);
        setResult(res.data);
      } catch {
        toast.error("Không thể kết nối máy chủ", "Kiểm tra mạng rồi thử lại.");
      }
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5" aria-labelledby="idea-title">
      <div>
        <h2 id="idea-title" className="flex items-center gap-2 font-bold">
          <Lightbulb className="size-5 text-amber-500" /> Ý tưởng sự kiện & tuyển sinh (AI)
        </h2>
        <p className="text-sm text-muted-foreground">Kịch bản ngoại khoá, chương trình khuyến mãi / khai giảng, lời tư vấn tuyển sinh Tiền tiểu học, Toán tư duy theo từng mùa.</p>
      </div>
      <Chips label="Dịp trong năm" keys={SEASON_KEYS} value={season} onChange={setSeason} text={(k) => SEASONS[k].label} />
      <Chips label="Khoá học" keys={COURSE_KEYS} value={course} onChange={setCourse} text={(k) => COURSES[k]} />
      <Chips label="Cần ý tưởng gì" keys={IDEA_KIND_KEYS} value={kind} onChange={setKind} text={(k) => `${IDEA_KINDS[k].emoji} ${IDEA_KINDS[k].label}`} />
      <div className="space-y-1">
        <label htmlFor="idea-note" className="text-sm font-semibold">
          Ghi chú thêm <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
        </label>
        <Textarea id="idea-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="VD: ngân sách khoảng 3 triệu, tổ chức ở CS2, muốn tăng 20 học viên mới" className="rounded-xl text-base md:text-sm" />
      </div>
      <Button type="button" onClick={generate} disabled={pending} className="h-11 w-full rounded-xl bg-amber-500 text-base font-bold text-white hover:bg-amber-600 sm:w-auto">
        {pending ? <Loader2 className="animate-spin" /> : <Lightbulb />}
        {pending ? "AI đang lên ý tưởng..." : "Gợi ý ý tưởng"}
      </Button>

      {result && !pending && (
        <div className="space-y-3" aria-live="polite">
          {result.notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{result.notice}</p>}
          {result.ideas.map((i, n) => (
            <article key={n} className="space-y-2 rounded-xl bg-amber-50/50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900" aria-label={i.name}>
              <h3 className="font-bold">{i.name}</h3>
              <p className="text-sm text-muted-foreground">🎯 {i.goal}</p>
              <div>
                <p className="text-xs font-bold">Kịch bản tổ chức</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
                  {i.plan.map((p, k) => (
                    <li key={k}>{p}</li>
                  ))}
                </ol>
              </div>
              <p className="text-sm">
                <b>🎁 Ưu đãi:</b> {i.offer}
              </p>
              <div>
                <p className="text-xs font-bold">💬 Ý tư vấn phụ huynh</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {i.talkingPoints.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button type="button" size="sm" className="rounded-lg" onClick={() => onUseIdea(i.announcementPoints)}>
                  <Megaphone className="size-4" /> Tạo thông báo từ ý tưởng này
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg bg-background"
                  onClick={() => void navigator.clipboard?.writeText(ideaText(i)).then(() => toast.success("Đã sao chép ý tưởng"), () => toast.error("Không sao chép được"))}
                >
                  <Copy className="size-4" /> Sao chép
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
