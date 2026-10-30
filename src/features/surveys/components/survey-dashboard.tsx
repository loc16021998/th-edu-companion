import Link from "next/link";
import { MessageSquareQuote, Star } from "lucide-react";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn } from "@/lib/utils";
import { SURVEY_OPEN_DAY, SURVEY_SUBJECTS, periodLabel } from "../constants";
import type { SurveyStats } from "../queries";

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const vn1 = (n: number) => n.toFixed(1).replace(".", ",");

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border", tone)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Thanh ngang 0..max — 1 màu (độ lớn), số liệu ghi bằng chữ bên cạnh (không dựa vào màu). */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-amber-400" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function SurveyDashboard({ stats, periods, hrefFor }: { stats: SurveyStats; periods: string[]; hrefFor: (period: string) => string }) {
  const total = stats.answered;
  const maxDist = Math.max(...stats.distribution, 1);
  const lowFirst = [...stats.comments].sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Popup tự hiện cho phụ huynh từ ngày {SURVEY_OPEN_DAY} tới hết tháng · mỗi phụ huynh trả lời 1 lần / tháng.
        </p>
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Chọn tháng">
          {periods.slice(0, 6).map((p) => (
            <Link
              key={p}
              href={hrefFor(p)}
              aria-current={p === stats.period ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1",
                p === stats.period ? "bg-slate-900 text-white ring-slate-900" : "bg-card text-muted-foreground ring-border",
              )}
            >
              T{Number(p.slice(5, 7))}/{p.slice(2, 4)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Điểm trung bình" value={stats.average === null ? "—" : `${vn1(stats.average)}★`} hint={`${total} lượt chấm`} tone="bg-amber-50 ring-amber-200" />
        <Tile label="Hài lòng (4–5★)" value={stats.csat === null ? "—" : `${stats.csat}%`} hint="CSAT" />
        <Tile
          label="Tỉ lệ phản hồi"
          value={stats.parents ? `${Math.round((total / stats.parents) * 100)}%` : "—"}
          hint={`${total}/${stats.parents} phụ huynh`}
        />
        <Tile label="Bỏ qua" value={String(stats.declined)} hint="chọn “Không hỏi tháng này”" />
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Chưa có phụ huynh nào chấm điểm {periodLabel(stats.period)}.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={`Phân bố điểm ${periodLabel(stats.period)}`}>
            <ul className="space-y-2">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = stats.distribution[n - 1]!;
                return (
                  <li key={n} className="flex items-center gap-2 text-sm">
                    <span className="flex w-10 shrink-0 items-center gap-0.5 font-semibold tabular-nums">
                      {n}
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    </span>
                    <Bar value={count} max={maxDist} />
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {count} · {Math.round((count / total) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Hài lòng theo môn học">
            <ul className="space-y-2">
              {stats.subjects.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 font-medium">{SURVEY_SUBJECTS[s.key]}</span>
                  <Bar value={s.average ?? 0} max={5} />
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {s.average === null ? "chưa có" : `${vn1(s.average)}★ · ${s.count}`}
                  </span>
                </li>
              ))}
            </ul>
            {stats.byCampus.length > 1 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground">Theo cơ sở</p>
                {stats.byCampus.map((c) => (
                  <div key={c.campus} className="flex items-center justify-between text-sm">
                    <span>{CAMPUS_LABELS[c.campus as keyof typeof CAMPUS_LABELS] ?? c.campus}</span>
                    <span className="tabular-nums">
                      <b>{vn1(c.average)}★</b> <span className="text-xs text-muted-foreground">({c.count})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      <Section title="Xu hướng 6 tháng (điểm trung bình)">
        <ol className="grid grid-cols-6 items-end gap-2" aria-label="Điểm trung bình 6 tháng gần nhất">
          {stats.trend.map((t) => (
            <li key={t.period} className="flex flex-col items-center gap-1 text-center">
              <span className="text-xs font-bold tabular-nums">{t.average === null ? "—" : vn1(t.average)}</span>
              <div className="flex h-24 w-full items-end justify-center rounded-lg bg-muted/40">
                <div
                  className={cn("w-3/5 rounded-t-md", t.period === stats.period ? "bg-amber-500" : "bg-amber-300")}
                  style={{ height: `${t.average === null ? 0 : (t.average / 5) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                T{Number(t.period.slice(5, 7))} · {t.count}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={`Nhận xét của phụ huynh (${lowFirst.length}) — điểm thấp lên trước`}>
        {lowFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có nhận xét.</p>
        ) : (
          <ul className="space-y-2">
            {lowFirst.map((c) => (
              <li key={c.id} className={cn("rounded-xl p-3 text-sm ring-1", c.rating <= 2 ? "bg-rose-50 ring-rose-200" : "bg-muted/40 ring-border")}>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5 font-bold text-foreground">
                    {c.rating}
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  </span>
                  {c.classNames.length > 0 && <span>· Lớp {c.classNames.join(", ")}</span>}
                  <span>· {dateFmt.format(new Date(c.createdAt))}</span>
                </p>
                <p className="mt-1 flex gap-2">
                  <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="whitespace-pre-wrap break-words">{c.comment}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
