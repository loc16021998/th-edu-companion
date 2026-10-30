import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { getAnalyticsReport } from "@/features/analytics/queries";
import {
  SUBJECT_KEYS,
  SUBJECT_LABEL,
  attendanceSeries,
  classesNeedingAttention,
  deriveKpis,
  fillRates,
  revenueSeries,
  studentSeries,
  subjectEnrollment,
  subjectTrend,
} from "@/features/analytics/derive";
import { CAMPUS_LABELS } from "@/config/constants";
import { buildXlsx, type Cell } from "@/lib/export/xlsx";

/** "Xuất báo cáo tổng kết" (.xlsx, nhiều sheet) cho họp giao ban: ?months=6|12. Chỉ quản trị viên. */
export async function GET(request: NextRequest) {
  await requireRole("admin");
  const months = request.nextUrl.searchParams.get("months") === "6" ? 6 : 12;
  const r = await getAnalyticsReport(months, 12);
  if (!r) return NextResponse.json({ error: "Chưa chạy supabase/apply-analytics.sql" }, { status: 409 });

  const k = deriveKpis(r);
  const C = ["CS1_XALA", "CS2_NGOTHINHAM"] as const;

  const overview: Cell[][] = [
    ["Chỉ số", "Giá trị", "Ghi chú"],
    ["Học sinh đang theo học", k.students, `CS1 ${r.students_by_campus.CS1_XALA ?? 0} · CS2 ${r.students_by_campus.CS2_NGOTHINHAM ?? 0}`],
    ["Học sinh mới tháng này", k.newThisMonth, ""],
    ["Học sinh có đi học tháng này", k.activeThisMonth, k.activeDelta === null ? "" : `${k.activeDelta >= 0 ? "+" : ""}${k.activeDelta} so với tháng trước`],
    ["Tỷ lệ giữ chân tháng này (%)", k.retentionNow, "Đã học tháng trước và vẫn học tháng này"],
    ["Tỷ lệ giữ chân TB 3 tháng (%)", k.retention3m, ""],
    ["Chuyên cần 4 tuần (%)", k.attendanceRate, "Không tính nghỉ có phép"],
    ["Học thử → nhập học (%)", k.trialConversion, k.funnel ? `${k.funnel.enrolled_after_trial}/${k.funnel.trialed}` : "Chưa có CRM tuyển sinh"],
    ["Tư vấn → nhập học (%)", k.leadConversion, k.funnel ? `${k.funnel.enrolled} nhập học · ${k.funnel.lost} không theo · ${k.funnel.open} đang tư vấn` : ""],
    ["Thực thu tháng này (VNĐ)", k.collectedThisMonth, ""],
    ["Công nợ hiện tại (VNĐ)", k.outstandingTotal, ""],
    ["Thời điểm lập báo cáo", new Date(r.generated_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }), ""],
  ];
  const campus: Cell[][] = [
    ["Chỉ số", ...C.map((c) => CAMPUS_LABELS[c])],
    ["Học sinh đang học", ...C.map((c) => r.students_by_campus[c] ?? 0)],
    ["Học sinh mới tháng này", ...C.map((c) => r.campus[c]?.new_students_month ?? 0)],
    ["Số lớp", ...C.map((c) => r.campus[c]?.classes ?? 0)],
    ["Chuyên cần 30 ngày (%)", ...C.map((c) => r.campus[c]?.attendance_rate ?? null)],
    ["Học phí phát hành tháng này (VNĐ)", ...C.map((c) => r.campus[c]?.issued_month ?? 0)],
    ["Thực thu tháng này (VNĐ)", ...C.map((c) => r.campus[c]?.collected_month ?? 0)],
    ["Công nợ hiện tại (VNĐ)", ...C.map((c) => r.campus[c]?.outstanding ?? 0)],
  ];
  const revenue: Cell[][] = [["Tháng", "Phát hành (VNĐ)", "Thực thu (VNĐ)", "Còn thiếu (VNĐ)"], ...revenueSeries(r).map((x) => [x.month, x.issued, x.collected, x.outstanding])];
  const students: Cell[][] = [["Tháng", "Học sinh mới", "Có đi học", "Giữ chân (%)"], ...studentSeries(r).map((x) => [x.month, x.newStudents, x.active, x.retention])];
  const attendance: Cell[][] = [
    ["Tuần từ", "Chuyên cần CS1 (%)", "Chuyên cần CS2 (%)", "Nghỉ không phép", "Nghỉ có phép", "Đi muộn"],
    ...attendanceSeries(r).map((x) => [x.week, x.CS1_XALA, x.CS2_NGOTHINHAM, x.absent, x.excused, x.late]),
  ];
  const attention: Cell[][] = [
    ["Cơ sở", "Lớp", "Học sinh", "Nghỉ không phép 4 tuần (%)", "4 tuần trước (%)", "Đi muộn (%)"],
    ...classesNeedingAttention(r).map((c) => [CAMPUS_LABELS[c.campus], c.class_name, c.students, c.absent_rate, c.prev_absent_rate, c.late_rate]),
  ];
  const subjects: Cell[][] = [
    ["Môn", "Đăng ký CS1", "Đăng ký CS2", "Tổng", "Sĩ số tối đa (lớp đã đặt)", "Lấp đầy (%)"],
    ...subjectEnrollment(r).map((e) => {
      const f = fillRates(r).find((x) => x.subject === e.subject);
      return [e.label, e.CS1_XALA, e.CS2_NGOTHINHAM, e.total, f?.capacity || null, f?.rate ?? null];
    }),
    [],
    ["Tháng", ...SUBJECT_KEYS.map((s) => `${SUBJECT_LABEL[s]} (tư vấn + nhập học)`)],
    ...subjectTrend(r).map((t) => [String(t.month), ...SUBJECT_KEYS.map((s) => Number(t[s]))]),
  ];

  const xlsx = buildXlsx([
    { name: "Tổng quan", rows: overview, widths: [34, 22, 52] },
    { name: "Theo cơ sở", rows: campus, widths: [34, 22, 22] },
    { name: "Doanh thu", rows: revenue, widths: [12, 20, 20, 20] },
    { name: "Học sinh", rows: students, widths: [12, 16, 16, 16] },
    { name: "Chuyên cần theo tuần", rows: attendance, widths: [14, 18, 18, 16, 14, 12] },
    { name: "Lớp cần chú ý", rows: attention, widths: [20, 12, 10, 24, 18, 14] },
    { name: "Môn học", rows: subjects, widths: [26, 16, 16, 10, 24, 14] },
  ]);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-tong-ket-${r.today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
