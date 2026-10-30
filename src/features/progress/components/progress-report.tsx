import Link from "next/link";
import { BarChart3, CalendarCheck2, ChevronLeft, ChevronRight, NotebookPen, TrendingUp } from "lucide-react";
import { BrandFullLogo } from "@/components/shared/brand-logo";
import { CAMPUS_LABELS } from "@/config/constants";
import { addMonths, fullDate, startOfMonth } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database.types";
import type { StudentProgress } from "../queries";
import { AttendanceChart, SubjectProgressChart } from "./progress-charts";
import { PrintButton } from "./print-button";

/** "2026-10-01" → "tháng 10/2026" */
export function monthTitle(iso: string) {
  return `tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
}

export function MonthNav({ month, today, hrefFor }: { month: string; today: string; hrefFor: (month: string) => string }) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const canNext = next <= startOfMonth(today);
  return (
    <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-sm ring-1 ring-border print:hidden">
      <Link href={hrefFor(prev)} aria-label="Tháng trước" className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-28 text-center text-sm font-bold capitalize">{monthTitle(month)}</span>
      {canNext ? (
        <Link href={hrefFor(next)} aria-label="Tháng sau" className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="flex size-8 items-center justify-center text-muted-foreground/40" aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof TrendingUp; tone: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border print:shadow-none">
      <span className={cn("flex size-8 items-center justify-center rounded-lg", tone)}>
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-2xl font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Panel({ title, icon: Icon, children, className }: { title: string; icon: typeof TrendingUp; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid print:shadow-none", className)}>
      <h2 className="flex items-center gap-2 font-bold">
        <Icon className="size-5 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Báo cáo tiến độ (dùng chung trang phụ huynh và giáo viên): tiêu đề in được, chọn tháng, xuất PDF,
 * số liệu tháng, biểu đồ chuyên cần, biểu đồ tiến bộ từng môn. `summary`: khối nhận xét tổng kết tháng.
 */
export function ProgressReport({
  student,
  progress,
  month,
  today,
  hrefForMonth,
  summary,
  toolbar,
  readOnly = false,
}: {
  student: Pick<Tables<"students">, "full_name" | "class_name" | "campus">;
  progress: StudentProgress;
  month: string;
  today: string;
  hrefForMonth: (month: string) => string;
  summary: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Phụ huynh: CHỈ XEM — không chuyển tháng, không xuất PDF, không tab / nút trong biểu đồ */
  readOnly?: boolean;
}) {
  const current = progress.attendance[progress.attendance.length - 1];
  const sessions = current ? current.present + current.late + current.absent : 0;

  return (
    <div className="space-y-4 print:space-y-3">
      {/* Đầu báo cáo khi in / PDF */}
      <div className="hidden items-center justify-between border-b pb-3 print:flex">
        <BrandFullLogo className="h-14" />
        <div className="text-right">
          <p className="text-lg font-extrabold">Báo cáo tiến độ học tập</p>
          <p className="text-sm">
            {student.full_name} · Lớp {student.class_name} · {CAMPUS_LABELS[student.campus]}
          </p>
          <p className="text-xs text-muted-foreground">
            Dữ liệu đến {fullDate(progress.monthEnd)} · xuất ngày {fullDate(today)}
          </p>
        </div>
      </div>

      {readOnly ? (
        <p className="text-sm font-semibold capitalize text-muted-foreground print:hidden">{monthTitle(month)}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <MonthNav month={month} today={today} hrefFor={hrefForMonth} />
          <div className="flex items-center gap-2">
            {toolbar}
            <PrintButton fileName={`Bao-cao-tien-do-${student.full_name.replace(/\s+/g, "-")}-${month.slice(0, 7)}`} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={CalendarCheck2}
          label={`Chuyên cần ${monthTitle(month)}`}
          value={current?.rate === null || current?.rate === undefined ? "—" : `${current.rate}%`}
          sub={sessions ? `${sessions} buổi đã điểm danh` : "Chưa có điểm danh"}
          tone="bg-emerald-100 text-emerald-700"
        />
        <Stat icon={CalendarCheck2} label="Đi muộn / Nghỉ" value={`${current?.late ?? 0} / ${current?.absent ?? 0}`} sub="buổi trong tháng" tone="bg-amber-100 text-amber-700" />
        <Stat icon={NotebookPen} label="Sổ liên lạc" value={String(progress.reportsInMonth)} sub="buổi có nhận xét" tone="bg-orange-100 text-orange-700" />
        <Stat
          icon={TrendingUp}
          label="Điểm chung TB"
          value={(() => {
            const vals = progress.subjects.flatMap((s) => (s.overall.avg === null ? [] : [s.overall.avg]));
            return vals.length ? `${Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10}/5` : "—";
          })()}
          sub="trung bình các môn"
          tone="bg-sky-100 text-sky-700"
        />
      </div>

      <Panel title="Tỷ lệ chuyên cần theo tháng" icon={CalendarCheck2}>
        <AttendanceChart data={progress.attendance} readOnly={readOnly} />
      </Panel>

      <Panel title="Tiến bộ từng môn (theo tuần)" icon={BarChart3}>
        <SubjectProgressChart subjects={progress.subjects} monthLabel={monthTitle(month)} readOnly={readOnly} />
      </Panel>

      {summary}
    </div>
  );
}
