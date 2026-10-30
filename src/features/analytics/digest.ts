// Báo cáo tuần (tối Chủ nhật): doanh thu + sĩ số + chuyên cần + tuyển sinh. Module thuần — dùng cho bảng tin quản trị & email.
import { formatVND } from "@/lib/utils";
import { attendanceSeries, classesNeedingAttention, deriveKpis, type AnalyticsReport } from "./derive";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("vi-VN")}%`);

export function weeklyDigest(r: AnalyticsReport, appUrl?: string) {
  const k = deriveKpis(r);
  const weeks = attendanceSeries(r);
  const week = weeks[weeks.length - 1];
  const prevWeek = weeks[weeks.length - 2];
  const rate = (w: (typeof weeks)[number] | undefined) => {
    if (!w) return null;
    const vals = [w.CS1_XALA, w.CS2_NGOTHINHAM].filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const attention = classesNeedingAttention(r);
  const from = r.this_week?.from ?? week?.week ?? r.today;
  const label = `${from.slice(8, 10)}/${from.slice(5, 7)} – ${r.today.slice(8, 10)}/${r.today.slice(5, 7)}`;

  const lines = [
    `Thực thu tuần này: ${formatVND(r.this_week?.collected ?? 0)} · tháng đến nay: ${formatVND(k.collectedThisMonth)}`,
    `Sĩ số: ${k.students} học sinh (CS1 ${r.students_by_campus.CS1_XALA ?? 0} · CS2 ${r.students_by_campus.CS2_NGOTHINHAM ?? 0}) · ${r.this_week?.new_students ?? 0} học sinh mới trong tuần`,
    `Chuyên cần tuần: CS1 ${pct(week?.CS1_XALA)} · CS2 ${pct(week?.CS2_NGOTHINHAM)}${prevWeek ? ` (tuần trước ${pct(rate(prevWeek))})` : ""} · ${week?.absent ?? 0} buổi nghỉ không phép`,
    `Công nợ hiện tại: ${formatVND(k.outstandingTotal)}`,
    ...(r.leads_this_week !== undefined ? [`Tuyển sinh: ${r.leads_this_week} phụ huynh mới hỏi tư vấn · học thử → nhập học ${pct(k.trialConversion)}`] : []),
    attention.length
      ? `Lớp cần chú ý: ${attention
          .slice(0, 5)
          .map((c) => `${c.class_name} (${pct(c.absent_rate)} nghỉ)`)
          .join(", ")}`
      : "Không có lớp nào có tỷ lệ nghỉ bất thường.",
  ];

  const title = `Báo cáo tuần ${label}: thu ${formatVND(r.this_week?.collected ?? 0)} · ${k.students} học sinh`;
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/admin/analytics` : null;
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:13px;color:#475569">TH EDU Companion · Báo cáo tự động</p>
  <h1 style="margin:0 0 16px;font-size:20px">Báo cáo tuần ${esc(label)}</h1>
  <ul style="margin:0;padding:16px 16px 16px 32px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;line-height:1.7;font-size:15px">
    ${lines.map((l) => `<li>${esc(l)}</li>`).join("")}
  </ul>
  ${link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#1e4fb0;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Xem phân tích đầy đủ</a></p>` : ""}
  <p style="font-size:12px;color:#64748b">Email gửi tự động mỗi tối Chủ nhật tới quản trị viên TH EDU.</p>
</div></body></html>`;

  return { title, body: lines.slice(0, 3).join(" · "), lines, html, weekKey: from };
}
