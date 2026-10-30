"use client";

// Phần VẼ biểu đồ (recharts ~117kB gzip) — tách riêng để nạp trễ (next/dynamic) sau khi trang Tiến độ đã hiện.
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AttendanceMonth, SubjectProgress } from "../queries";

// Không dùng hiệu ứng vẽ: biểu đồ hiện đủ ngay (nhẹ cho điện thoại yếu, xuất PDF không bị thiếu nét).
// Màu theo hướng dẫn trực quan hoá (đã chạy bộ kiểm tra bảng màu):
//  - Chuyên cần là TRẠNG THÁI → bảng màu trạng thái cố định, luôn kèm nhãn chữ (không dựa vào màu).
//  - 3 tiêu chí của môn → 3 màu phân loại đầu tiên theo thứ tự cố định; "Điểm chung" = xám trung tính, nét đứt.
const STATUS = { present: "#0ca30c", late: "#fab219", absent: "#d03b3b", excused: "#6366f1" } as const;
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const OVERALL = "#52514e";
const SURFACE = "#fcfcfb";
const INK_MUTED = "#6b6a66";
const GRID = "#e7e6e2";

const axisTick = { fill: INK_MUTED, fontSize: 14 };
/** Số thập phân kiểu Việt Nam, 1 chữ số: 4 → "4,0" */
const vn1 = (n: number) => n.toFixed(1).replace(".", ",");
/** Chữ chú thích dùng màu chữ thường (không mang màu series) — chấm/nét màu bên cạnh mới là nhận diện. */
const legendText = (value: string) => <span style={{ color: "#3a3a37" }}>{value}</span>;
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,.08)" },
  labelStyle: { fontWeight: 700, color: "#0b0b0b" },
  itemStyle: { color: "#0b0b0b", padding: 0 },
};

export function AttendanceBars({ data }: { data: AttendanceMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          formatter={(value, name) => [`${value} buổi`, name]}
          labelFormatter={(label, payload) => {
            const rate = payload?.[0]?.payload?.rate as number | null | undefined;
            return `${label}${typeof rate === "number" ? ` · chuyên cần ${rate}%` : ""}`;
          }}
        />
        <Legend iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        {/* 2px viền màu nền = khe hở giữa các khối chồng; bo góc chỉ ở đầu trên cùng */}
        <Bar dataKey="present" name="Có mặt" stackId="a" fill={STATUS.present} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="late" name="Đi muộn" stackId="a" fill={STATUS.late} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="absent" name="Nghỉ" stackId="a" fill={STATUS.absent} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="excused" name="Nghỉ có phép" stackId="a" fill={STATUS.excused} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SubjectLines({ criteria, data }: { criteria: SubjectProgress["criteria"]; data: SubjectProgress["weekly"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={axisTick} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }}
          labelFormatter={(label) => `Tuần từ ${label}`}
          formatter={(value, name) => [typeof value === "number" ? `${vn1(value)} / 5` : "—", name]}
        />
        <Legend iconType="plainline" iconSize={14} itemSorter={null} formatter={legendText} wrapperStyle={{ fontSize: 14 }} />
        {criteria.map((c, i) => (
          <Line
            key={c.key}
            type="monotone"
            dataKey={c.key}
            name={c.label}
            stroke={SERIES[i % SERIES.length]}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: SURFACE, fill: SERIES[i % SERIES.length] }}
            activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <Line
          type="monotone"
          dataKey="overall"
          name="Điểm chung"
          stroke={OVERALL}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 4, strokeWidth: 2, stroke: SURFACE, fill: OVERALL }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
