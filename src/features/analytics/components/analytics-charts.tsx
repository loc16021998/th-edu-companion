"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUBJECT_KEYS, SUBJECT_LABEL, type attendanceSeries, type revenueSeries, type studentSeries, type subjectTrend } from "../derive";

// Phần vẽ (recharts) nạp sau khi trang đã hiện; khung có chiều cao cố định → không nhảy bố cục.
const loading = () => <div className="size-full animate-pulse rounded-xl bg-muted/60" aria-hidden />;
const RevenueBars = dynamic(() => import("./analytics-charts-draw").then((m) => m.RevenueBars), { ssr: false, loading });
const StudentsChart = dynamic(() => import("./analytics-charts-draw").then((m) => m.StudentsChart), { ssr: false, loading });
const AttendanceRateLines = dynamic(() => import("./analytics-charts-draw").then((m) => m.AttendanceRateLines), { ssr: false, loading });
const AbsenceBars = dynamic(() => import("./analytics-charts-draw").then((m) => m.AbsenceBars), { ssr: false, loading });
const SubjectTrendLines = dynamic(() => import("./analytics-charts-draw").then((m) => m.SubjectTrendLines), { ssr: false, loading });

const vnd = (v: number) => v.toLocaleString("vi-VN");

/** Thẻ biểu đồ: tiêu đề, chú thích cách tính, biểu đồ (cao cố định), bảng số liệu (bật / tắt; luôn hiện khi in). */
function ChartCard({
  title,
  note,
  label,
  children,
  table,
  empty,
}: {
  title: string;
  note: string;
  label: string;
  children: React.ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  empty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border print:break-inside-avoid print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:bg-muted print:hidden"
        >
          <Table2 className="size-3.5" /> {open ? "Ẩn bảng số liệu" : "Xem bảng số liệu"}
        </button>
      </div>
      {empty ? (
        <p className="flex h-40 items-center justify-center rounded-2xl bg-muted/40 text-sm text-muted-foreground">Chưa có dữ liệu trong khoảng thời gian này.</p>
      ) : (
        <div className="h-64 w-full sm:h-72" role="img" aria-label={label}>
          {children}
        </div>
      )}
      <div className={cn("overflow-x-auto", !open && "hidden print:block")}>
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {table.head.map((h, i) => (
                <th key={h} className={cn("px-2 py-1.5 font-semibold", i === 0 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {table.rows.map((r) => (
              <tr key={String(r[0])}>
                {r.map((c, i) => (
                  <td key={i} className={cn("px-2 py-1.5 tabular-nums", i === 0 ? "text-left font-semibold" : "text-right")}>
                    {c}
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

export function AnalyticsCharts({
  revenue,
  students,
  attendance,
  subjects,
  hasLeads,
}: {
  revenue: ReturnType<typeof revenueSeries>;
  students: ReturnType<typeof studentSeries>;
  attendance: ReturnType<typeof attendanceSeries>;
  subjects: ReturnType<typeof subjectTrend>;
  hasLeads: boolean;
}) {
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Doanh thu học phí theo tháng"
        note="Thực thu = tiền ghi nhận trong tháng (mọi khoản). Còn thiếu = phần chưa đóng của các khoản học phí phát hành cho tháng đó."
        label="Biểu đồ cột thực thu và còn thiếu theo tháng"
        empty={!revenue.some((r) => r.collected || r.outstanding)}
        table={{ head: ["Tháng", "Phát hành", "Thực thu", "Còn thiếu"], rows: revenue.map((r) => [r.label, vnd(r.issued), vnd(r.collected), vnd(r.outstanding)]) }}
      >
        <RevenueBars data={revenue} />
      </ChartCard>

      <ChartCard
        title="Tăng trưởng học sinh theo tháng"
        note="Số học sinh có ít nhất 1 buổi có mặt / đi muộn trong tháng. Học sinh mới & tỷ lệ giữ chân: chạm vào từng tháng hoặc xem bảng."
        label="Biểu đồ đường số học sinh có đi học theo tháng"
        empty={!students.some((s) => s.newStudents || s.active)}
        table={{ head: ["Tháng", "Mới", "Có đi học", "Giữ chân"], rows: students.map((s) => [s.label, s.newStudents, s.active, pct(s.retention)]) }}
      >
        <StudentsChart data={students} />
      </ChartCard>

      <ChartCard
        title="Tỷ lệ chuyên cần theo tuần"
        note="(Có mặt + đi muộn) / (có mặt + đi muộn + nghỉ không phép). Nghỉ có phép không tính."
        label="Biểu đồ đường tỷ lệ chuyên cần theo tuần của 2 cơ sở"
        empty={!attendance.length}
        table={{ head: ["Tuần từ", "CS1 Xa La", "CS2 Ngô Thì Nhậm"], rows: attendance.map((a) => [a.label, pct(a.CS1_XALA), pct(a.CS2_NGOTHINHAM)]) }}
      >
        <AttendanceRateLines data={attendance} />
      </ChartCard>

      <ChartCard
        title="Số buổi nghỉ theo tuần"
        note="Toàn trung tâm. Tăng đột biến → xem bảng “Lớp cần chú ý”."
        label="Biểu đồ cột chồng số buổi nghỉ không phép và có phép theo tuần"
        empty={!attendance.length}
        table={{ head: ["Tuần từ", "Nghỉ không phép", "Nghỉ có phép", "Đi muộn"], rows: attendance.map((a) => [a.label, a.absent, a.excused, a.late]) }}
      >
        <AbsenceBars data={attendance} />
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard
          title="Xu hướng quan tâm môn học"
          note={
            hasLeads
              ? "Mỗi tháng = phụ huynh hỏi tư vấn (CRM tuyển sinh) + học sinh mới đăng ký môn. 1 bé học nhiều môn → tính ở mỗi môn."
              : "Học sinh mới đăng ký từng môn mỗi tháng (thêm số phụ huynh hỏi tư vấn sau khi chạy apply-admissions.sql)."
          }
          label="Biểu đồ đường số lượt quan tâm từng môn theo tháng"
          empty={!subjects.some((s) => SUBJECT_KEYS.some((k) => Number(s[k])))}
          table={{
            head: ["Tháng", ...SUBJECT_KEYS.map((k) => SUBJECT_LABEL[k]!)],
            rows: subjects.map((s) => [String(s.label), ...SUBJECT_KEYS.map((k) => `${s[k]} (${s[`${k}_leads`]} tư vấn · ${s[`${k}_enrolled`]} nhập học)`)]),
          }}
        >
          <SubjectTrendLines data={subjects} />
        </ChartCard>
      </div>
    </div>
  );
}
