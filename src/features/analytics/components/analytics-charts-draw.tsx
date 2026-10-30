"use client";

// Phần VẼ biểu đồ phân tích (recharts) — nạp trễ (next/dynamic) sau khi trang đã hiện.
// Màu theo hướng dẫn trực quan hoá (đã chạy bộ kiểm tra bảng màu: CVD + tương phản):
//  thực thu / còn thiếu = slot 1–2; 3 môn = slot 1–3 (đạt all-pairs); 2 cơ sở = màu nhận diện cơ sở sẵn có.
//  Màu có tương phản < 3:1 (aqua, amber) luôn đi kèm chú giải chữ + bảng số liệu (nút "Xem bảng số liệu").
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CAMPUS_SERIES_COLOR, MONEY_COLOR, SUBJECT_COLOR, SUBJECT_KEYS, SUBJECT_LABEL, type attendanceSeries, type revenueSeries, type studentSeries, type subjectTrend } from "../derive";

const SURFACE = "#ffffff";
const INK_MUTED = "#6b6a66";
const GRID = "#e7e6e2";
const axisTick = { fill: INK_MUTED, fontSize: 13 };
const legendText = (value: string) => <span style={{ color: "#3a3a37" }}>{value}</span>;
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,.08)" },
  labelStyle: { fontWeight: 700, color: "#0b0b0b" },
  itemStyle: { color: "#0b0b0b", padding: 0 },
};
const margin = { top: 8, right: 8, left: 0, bottom: 0 };

/** 1.250.000.000 → "1,3 tỷ"; 85.000.000 → "85 tr" */
export function shortMoney(v: number) {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
}
const money = (v: number) => `${v.toLocaleString("vi-VN")} đ`;

export function RevenueBars({ data }: { data: ReturnType<typeof revenueSeries> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barCategoryGap="24%" barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={shortMoney} tick={axisTick} axisLine={false} tickLine={false} width={52} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(v, name) => [money(Number(v)), name]} />
        <Legend iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        <Bar dataKey="collected" name="Thực thu trong tháng" fill={MONEY_COLOR.collected} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="outstanding" name="Còn thiếu (khoản của tháng)" fill={MONEY_COLOR.outstanding} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Tăng trưởng: học sinh có đi học mỗi tháng (1 series → không cần chú giải; tiêu đề thẻ đã gọi tên).
 * Học sinh mới (vài em / tháng) chênh hàng chục lần → không vẽ chung trục (cột sẽ bẹp, đọc sai) — nằm ở tooltip + bảng số liệu.
 */
export function StudentsChart({ data }: { data: ReturnType<typeof studentSeries> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} domain={["auto", "auto"]} tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v) => [`${v} học sinh`, "Có đi học"]}
          labelFormatter={(label, payload) => {
            const row = payload?.[0]?.payload as { newStudents?: number; retention?: number | null } | undefined;
            return `${label}${row ? ` · ${row.newStudents ?? 0} mới${row.retention != null ? ` · giữ chân ${row.retention}%` : ""}` : ""}`;
          }}
        />
        <Line dataKey="active" name="Học sinh có đi học" stroke={MONEY_COLOR.collected} strokeWidth={2} dot={{ r: 4, fill: MONEY_COLOR.collected, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AttendanceRateLines({ data }: { data: ReturnType<typeof attendanceSeries> }) {
  const values = data.flatMap((d) => [d.CS1_XALA, d.CS2_NGOTHINHAM]).filter((v): v is number => typeof v === "number");
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5) : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis domain={[min, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} width={44} />
        <Tooltip {...tooltipStyle} formatter={(v, name) => [v === null ? "—" : `${v}%`, name]} labelFormatter={(l) => `Tuần từ ${l}`} />
        <Legend iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        {(["CS1_XALA", "CS2_NGOTHINHAM"] as const).map((c) => (
          <Line
            key={c}
            dataKey={c}
            name={c === "CS1_XALA" ? "CS1 Xa La" : "CS2 Ngô Thì Nhậm"}
            stroke={CAMPUS_SERIES_COLOR[c]}
            strokeWidth={2}
            connectNulls
            dot={{ r: 4, fill: CAMPUS_SERIES_COLOR[c], stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AbsenceBars({ data }: { data: ReturnType<typeof attendanceSeries> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(v, name) => [`${v} buổi`, name]} labelFormatter={(l) => `Tuần từ ${l}`} />
        <Legend iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        {/* 2px viền màu nền = khe hở giữa khối chồng; bo góc chỉ ở đầu trên cùng */}
        <Bar dataKey="absent" name="Nghỉ không phép" stackId="a" fill={MONEY_COLOR.outstanding} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="excused" name="Nghỉ có phép" stackId="a" fill={MONEY_COLOR.collected} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SubjectTrendLines({ data }: { data: ReturnType<typeof subjectTrend> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip {...tooltipStyle} formatter={(v, name) => [`${v} lượt`, name]} />
        <Legend iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        {SUBJECT_KEYS.map((s) => (
          <Line key={s} dataKey={s} name={SUBJECT_LABEL[s]} stroke={SUBJECT_COLOR[s]} strokeWidth={2} dot={{ r: 4, fill: SUBJECT_COLOR[s], stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
