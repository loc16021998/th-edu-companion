import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleAlert, Minus } from "lucide-react";
import { CAMPUS_LABELS } from "@/config/constants";
import { cn, formatVND } from "@/lib/utils";
import { ABSENT_ALERT, ABSENT_RISE_ALERT, type AnalyticsReport, type classesNeedingAttention, type deriveKpis, type fillRates, type subjectEnrollment } from "../derive";

const CAMPUSES = ["CS1_XALA", "CS2_NGOTHINHAM"] as const;
/** Ô KPI hẹp trên điện thoại: 264.000.000 → "264 triệu đ" (số chính xác ghi ngay dưới). */
function compactVND(v: number) {
  const f = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: n < 100 ? 1 : 0 });
  if (Math.abs(v) >= 1e9) return `${f(v / 1e9)} tỷ đ`;
  if (Math.abs(v) >= 1e6) return `${f(v / 1e6)} triệu đ`;
  return formatVND(v);
}
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("vi-VN")}%`);

function Delta({ value, unit = "" }: { value: number | null; unit?: string }) {
  if (value === null) return null;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-700" : "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden />
      {value > 0 ? "+" : ""}
      {value.toLocaleString("vi-VN")}
      {unit} so với tháng trước
    </span>
  );
}

function Tile({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold leading-tight [overflow-wrap:anywhere] sm:text-2xl">{value}</p>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KpiTiles({ k }: { k: ReturnType<typeof deriveKpis> }) {
  return (
    <section aria-label="Chỉ số chính" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Học sinh đang theo học" value={k.students.toLocaleString("vi-VN")} hint={`${k.newThisMonth} học sinh mới tháng này`} />
      <Tile label="Có đi học tháng này" value={k.activeThisMonth.toLocaleString("vi-VN")}>
        <Delta value={k.activeDelta} />
      </Tile>
      <Tile label="Tỷ lệ giữ chân" value={pct(k.retentionNow)} hint={`Trung bình 3 tháng trước: ${pct(k.retention3m)}`} />
      <Tile label="Học thử → nhập học" value={pct(k.trialConversion)} hint={k.funnel ? `${k.funnel.enrolled_after_trial}/${k.funnel.trialed} bé đã học thử` : "Có sau khi chạy apply-admissions.sql"} />
      <Tile label="Chuyên cần 4 tuần" value={pct(k.attendanceRate)} hint="Không tính nghỉ có phép" />
      <Tile label="Thực thu tháng này" value={compactVND(k.collectedThisMonth)} hint={formatVND(k.collectedThisMonth)} />
      <Tile label="Công nợ hiện tại" value={compactVND(k.outstandingTotal)} hint={`${formatVND(k.outstandingTotal)} chưa đóng đủ`} />
      <Tile
        label="Tư vấn → nhập học"
        value={pct(k.leadConversion)}
        hint={k.funnel ? `${k.funnel.enrolled} nhập học · ${k.funnel.lost} không theo · ${k.funnel.open} đang tư vấn` : undefined}
      />
    </section>
  );
}

export function CampusComparison({ report }: { report: AnalyticsReport }) {
  const rows: { label: string; value: (c: (typeof CAMPUSES)[number]) => string }[] = [
    { label: "Học sinh đang học", value: (c) => String(report.students_by_campus[c] ?? 0) },
    { label: "Học sinh mới tháng này", value: (c) => String(report.campus[c]?.new_students_month ?? 0) },
    { label: "Số lớp", value: (c) => String(report.campus[c]?.classes ?? 0) },
    { label: "Chuyên cần 30 ngày", value: (c) => pct(report.campus[c]?.attendance_rate) },
    { label: "Học phí phát hành tháng này", value: (c) => formatVND(report.campus[c]?.issued_month ?? 0) },
    { label: "Thực thu tháng này", value: (c) => formatVND(report.campus[c]?.collected_month ?? 0) },
    { label: "Công nợ hiện tại", value: (c) => formatVND(report.campus[c]?.outstanding ?? 0) },
  ];
  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border print:break-inside-avoid" aria-labelledby="campus-compare">
      <h3 id="campus-compare" className="px-4 pt-4 text-base font-bold">
        So sánh 2 cơ sở
      </h3>
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Chỉ số</th>
              {CAMPUSES.map((c) => (
                <th key={c} className="px-2 py-2 text-right font-semibold">
                  {CAMPUS_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-2 py-2 font-medium">{r.label}</td>
                {CAMPUSES.map((c) => (
                  <td key={c} className="px-2 py-2 text-right font-semibold tabular-nums">
                    {r.value(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SubjectFill({ fill, enrollment }: { fill: ReturnType<typeof fillRates>; enrollment: ReturnType<typeof subjectEnrollment> }) {
  const anyCapacity = fill.some((f) => f.capacity > 0);
  return (
    <section className="space-y-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid" aria-labelledby="fill-heading">
      <div>
        <h3 id="fill-heading" className="text-base font-bold">
          Đăng ký & lấp đầy theo môn
        </h3>
        <p className="text-xs text-muted-foreground">Lấp đầy = học sinh / sĩ số tối đa của các lớp có môn chính đó (chỉ tính lớp đã đặt sĩ số tối đa).</p>
      </div>
      <ul className="space-y-3">
        {enrollment.map((e) => {
          const f = fill.find((x) => x.subject === e.subject);
          const rate = f?.rate ?? null;
          return (
            <li key={e.subject} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-bold">{e.label}</span>
                <span className="text-muted-foreground">
                  {e.total} học sinh đăng ký (CS1 {e.CS1_XALA} · CS2 {e.CS2_NGOTHINHAM})
                </span>
              </div>
              {rate !== null && f ? (
                <div className="space-y-1">
                  {/* Thanh đo: 1 giá trị trên nền xám — không dùng màu trạng thái */}
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(rate, 100)} aria-label={`Lấp đầy ${e.label}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lấp đầy <span className="font-bold text-foreground">{pct(rate)}</span> · {f.students_in_capped}/{f.capacity} chỗ ({f.classes_with_capacity}/{f.classes} lớp đã đặt sĩ số)
                    {rate > 100 && <span className="font-semibold text-foreground"> · vượt sĩ số tối đa</span>}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa có lớp môn này đặt sĩ số tối đa.</p>
              )}
            </li>
          );
        })}
      </ul>
      {!anyCapacity && (
        <p className="text-xs text-muted-foreground print:hidden">
          Đặt môn chính + sĩ số tối đa cho từng lớp tại{" "}
          <Link href="/admin/payroll/settings#class-meta" className="font-semibold text-primary underline">
            Lương giáo viên → Đơn giá & lớp
          </Link>
          .
        </p>
      )}
    </section>
  );
}

export function ClassesAttention({ classes }: { classes: ReturnType<typeof classesNeedingAttention> }) {
  return (
    <section className="space-y-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid" aria-labelledby="attention-heading">
      <div>
        <h3 id="attention-heading" className="flex items-center gap-2 text-base font-bold">
          <CircleAlert className="size-5 text-rose-600" aria-hidden /> Lớp cần chú ý
        </h3>
        <p className="text-xs text-muted-foreground">
          Nghỉ không phép ≥ {ABSENT_ALERT}% trong 4 tuần gần nhất, hoặc tăng ≥ {ABSENT_RISE_ALERT} điểm % so với 4 tuần trước đó.
        </p>
      </div>
      {classes.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">Không có lớp nào vượt ngưỡng.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Lớp</th>
                <th className="px-2 py-1.5 text-right font-semibold">Học sinh</th>
                <th className="px-2 py-1.5 text-right font-semibold">Nghỉ không phép</th>
                <th className="px-2 py-1.5 text-right font-semibold">So với 4 tuần trước</th>
                <th className="px-2 py-1.5 text-right font-semibold">Đi muộn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {classes.map((c) => (
                <tr key={`${c.campus}:${c.class_name}`}>
                  <td className="px-2 py-2 font-semibold">
                    Lớp {c.class_name} <span className="text-xs font-medium text-muted-foreground">· {CAMPUS_LABELS[c.campus]}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.students}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{pct(c.absent_rate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.rise === null ? "—" : `${c.rise > 0 ? "+" : ""}${c.rise.toLocaleString("vi-VN")} điểm`}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(c.late_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
