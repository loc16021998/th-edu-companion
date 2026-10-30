import Link from "next/link";
import { AlertTriangle, ChevronRight, Phone, type LucideIcon } from "lucide-react";
import { dayMonth, fullDate, toDate } from "@/lib/date";
import { cn, formatVND } from "@/lib/utils";
import { CAMPUS_COLOR, CAMPUS_LIST, CAMPUS_SHORT, type Campus } from "../constants";
import type { CenterDashboard, LatePayer } from "../queries";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** Thanh chia phần (2px khe giữa các đoạn, đầu bo tròn). Mỗi đoạn có title để rê chuột xem số. */
function SplitBar({ parts, className }: { parts: { value: number; color: string; label: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted", className)} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => <span key={p.label} title={`${p.label}: ${p.value.toLocaleString("vi-VN")}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
    </div>
  );
}

function CampusLegendRow({ campus, value, format = (v) => v.toLocaleString("vi-VN") }: { campus: Campus; value: number; format?: (v: number) => string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAMPUS_COLOR[campus] }} aria-hidden />
      <span className="flex-1 [overflow-wrap:anywhere] text-muted-foreground">{CAMPUS_SHORT[campus]}</span>
      <span className="font-bold tabular-nums">{format(value)}</span>
    </li>
  );
}

/** Ô quy mô: tổng + chia theo cơ sở. */
export function ScaleTile({ icon: Icon, label, byCampus, note, tone }: { icon: LucideIcon; label: string; byCampus: Record<Campus, number>; note?: string; tone: string }) {
  const total = CAMPUS_LIST.reduce((s, c) => s + byCampus[c], 0);
  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span className={cn("flex size-9 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="text-3xl font-extrabold tabular-nums leading-none">{total.toLocaleString("vi-VN")}</p>
      <SplitBar parts={CAMPUS_LIST.map((c) => ({ value: byCampus[c], color: CAMPUS_COLOR[c], label: CAMPUS_SHORT[c] }))} />
      <ul className="space-y-1">
        {CAMPUS_LIST.map((c) => (
          <CampusLegendRow key={c} campus={c} value={byCampus[c]} />
        ))}
      </ul>
      {note && <p className="text-xs text-amber-700">{note}</p>}
    </div>
  );
}

const ATT_PARTS = [
  { key: "present", label: "Có mặt", color: "#059669" },
  { key: "late", label: "Đi muộn", color: "#d97706" },
  { key: "absent", label: "Vắng", color: "#e11d48" },
  { key: "absent_with_permission", label: "Nghỉ có phép", color: "#6366f1" },
] as const;

/** Tỷ lệ điểm danh hôm nay toàn trung tâm + từng cơ sở. Tỷ lệ = (có mặt + muộn) / số đã điểm danh (không tính nghỉ có phép). */
export function AttendanceCard({ data, schoolDay }: { data: CenterDashboard; schoolDay: boolean }) {
  const totals = { present: 0, late: 0, absent: 0, absent_with_permission: 0 };
  for (const c of CAMPUS_LIST) for (const k of ATT_PARTS.map((p) => p.key)) totals[k] += data.attendance[c][k];
  const marked = totals.present + totals.late + totals.absent + totals.absent_with_permission;
  const students = CAMPUS_LIST.reduce((s, c) => s + data.scale[c].students, 0);
  const rate = pct(totals.present + totals.late, marked - totals.absent_with_permission);

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Điểm danh hôm nay</h2>
          <p className="text-xs text-muted-foreground">Toàn trung tâm · tỷ lệ đi học trên số đã điểm danh</p>
        </div>
        <Link href="/admin/attendance" className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Điểm danh →
        </Link>
      </div>

      {!schoolDay ? (
        <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">Hôm nay không có buổi học (Chủ nhật).</p>
      ) : marked === 0 ? (
        <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">Chưa lớp nào điểm danh hôm nay ({students} học sinh).</p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <p className="text-4xl font-extrabold tabular-nums leading-none">{rate}%</p>
            <p className="pb-0.5 text-xs text-muted-foreground">
              đã điểm danh {marked}/{students} học sinh ({pct(marked, students)}%)
            </p>
          </div>
          <SplitBar parts={ATT_PARTS.map((p) => ({ value: totals[p.key], color: p.color, label: p.label }))} className="h-3" />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {ATT_PARTS.map((p) => (
              <li key={p.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                <span className="text-muted-foreground">{p.label}</span>
                <span className="font-bold tabular-nums">{totals[p.key]}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-muted ring-1 ring-border" aria-hidden />
              <span className="text-muted-foreground">Chưa điểm danh</span>
              <span className="font-bold tabular-nums">{Math.max(students - marked, 0)}</span>
            </li>
          </ul>
          <div className="space-y-2 border-t pt-3">
            {CAMPUS_LIST.map((c) => {
              const a = data.attendance[c];
              const m = a.present + a.late + a.absent + a.absent_with_permission;
              const r = pct(a.present + a.late, m - a.absent_with_permission);
              return (
                <div key={c} className="flex items-center gap-3 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAMPUS_COLOR[c] }} aria-hidden />
                  <span className="w-36 shrink-0 font-medium max-[420px]:w-12">
                    <span className="max-[420px]:hidden">{CAMPUS_SHORT[c]}</span>
                    <span className="hidden max-[420px]:inline">{c === "CS1_XALA" ? "CS1" : "CS2"}</span>
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${r}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {m ? (
                      <>
                        <b className="text-foreground">{r}%</b> · {a.absent} vắng
                      </>
                    ) : (
                      "chưa điểm danh"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {schoolDay && data.teacherTotal > 0 && (
        <p className="text-xs text-muted-foreground">
          Giáo viên: <b className="text-foreground">{data.teacherAtt.present + data.teacherAtt.late}</b>/{data.teacherTotal} có mặt
          {data.teacherAtt.absent + data.teacherAtt.absent_with_permission > 0 && `, ${data.teacherAtt.absent + data.teacherAtt.absent_with_permission} vắng`}
          {data.teacherAtt.present + data.teacherAtt.late + data.teacherAtt.absent + data.teacherAtt.absent_with_permission === 0 && " (chưa chấm công)"}
        </p>
      )}
    </section>
  );
}

function Money({ label, value, tone, sub, className }: { label: string; value: number; tone?: string; sub?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-muted/50 p-3", className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-extrabold tabular-nums leading-tight [overflow-wrap:anywhere]", tone)}>{formatVND(value)}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Báo cáo học phí tháng: đã thu trong tháng, còn nợ, quá hạn, tiến độ kỳ thu. */
export function FeeReportCard({ data, monthTitle }: { data: CenterDashboard; monthTitle: string }) {
  const sum = (r: Record<Campus, number>) => CAMPUS_LIST.reduce((s, c) => s + r[c], 0);
  const outstanding = sum(data.outstanding);
  const overdue = sum(data.overdue);
  const collected = data.collected ? sum(data.collected) : null;

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Học phí tháng {monthTitle}</h2>
          <p className="text-xs text-muted-foreground">Đã thu tính theo ngày ghi nhận đóng tiền</p>
        </div>
        <Link href="/admin/fees" className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Ghi nhận đóng tiền →
        </Link>
      </div>

      {/* "Đã thu" nổi bật cả hàng; 2 ô còn lại chia đôi → số tiền dài không bị cắt */}
      <div className="grid grid-cols-2 gap-2">
        {collected !== null ? (
          <Money label="Đã thu trong tháng" value={collected} tone="text-2xl text-emerald-700" className="col-span-2" />
        ) : (
          <div className="col-span-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
            Chạy <code>supabase/apply-admin-center.sql</code> để theo dõi số tiền đã thu theo tháng.
          </div>
        )}
        <Money label="Còn phải thu" value={outstanding} />
        <Money label="Quá hạn" value={overdue} tone={overdue > 0 ? "text-rose-700" : undefined} sub={`${data.latePayers.length} phụ huynh chậm đóng`} />
      </div>

      {data.period && data.period.count > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Kỳ học phí tháng {monthTitle}</span>
            <span className="tabular-nums text-muted-foreground">
              <b className="text-foreground">{formatVND(data.period.paid)}</b> / {formatVND(data.period.issued)} ({pct(data.period.paid, data.period.issued)}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Đã thu ${pct(data.period.paid, data.period.issued)}% kỳ học phí`}>
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct(data.period.paid, data.period.issued)}%` }} />
          </div>
        </div>
      )}

      <ul className="divide-y border-t">
        {CAMPUS_LIST.map((c) => (
          <li key={c} className="grid grid-cols-3 gap-2 py-2.5 text-sm">
            <p className="col-span-3 flex items-center gap-2 font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: CAMPUS_COLOR[c] }} aria-hidden />
              {CAMPUS_SHORT[c]}
            </p>
            {[
              { label: "Đã thu", value: data.collected?.[c] ?? null, tone: "" },
              { label: "Còn phải thu", value: data.outstanding[c], tone: "" },
              { label: "Quá hạn", value: data.overdue[c], tone: data.overdue[c] > 0 ? "font-semibold text-rose-700" : "" },
            ].map((m) =>
              m.value === null ? (
                <span key={m.label} />
              ) : (
                <p key={m.label} className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{m.label}</span>
                  <span className={cn("block tabular-nums [overflow-wrap:anywhere]", m.tone)}>{formatVND(m.value)}</span>
                </p>
              ),
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function daysLate(due: string, today: string) {
  return Math.round((toDate(today).getTime() - toDate(due).getTime()) / 86_400_000);
}

/** Danh sách phụ huynh chậm đóng (quá hạn), cũ nhất trước. */
export function LatePayersCard({ payers, today, limit = 12 }: { payers: LatePayer[]; today: string; limit?: number }) {
  const shown = payers.slice(0, limit);
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          <AlertTriangle className="size-5 text-rose-600" /> Phụ huynh chậm đóng học phí
        </h2>
        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{payers.length}</span>
      </div>
      {payers.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">Không có khoản nào quá hạn. 🎉</p>
      ) : (
        <>
          <ul className="divide-y">
            {shown.map((p) => {
              const late = daysLate(p.oldestDue, today);
              return (
                <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="break-words font-semibold">{p.parentName ?? <span className="text-amber-700">Chưa liên kết phụ huynh</span>}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {p.children.map((c) => `${c.name} (${c.className} · ${c.campus === "CS1_XALA" ? "CS1" : "CS2"})`).join(", ")}
                    </p>
                  </div>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary ring-1 ring-border hover:bg-muted">
                      <Phone className="size-3.5" /> {p.phone.replace(/^\+84/, "0")}
                    </a>
                  )}
                  <div className="ml-auto text-right">
                    <p className="font-bold tabular-nums text-rose-700">{formatVND(p.owed)}</p>
                    <p className="text-xs text-muted-foreground" title={`Hạn cũ nhất ${fullDate(p.oldestDue)}`}>
                      quá hạn <b className="text-rose-700">{late} ngày</b>
                      <span className="block">
                        từ {dayMonth(p.oldestDue)}
                        {p.feeCount > 1 && ` · ${p.feeCount} khoản`}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {payers.length > limit && (
            <Link href="/admin/fees" className="flex items-center justify-center gap-1 rounded-xl bg-muted/60 py-2 text-sm font-semibold text-primary hover:bg-muted">
              Xem tất cả {payers.length} phụ huynh <ChevronRight className="size-4" />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
