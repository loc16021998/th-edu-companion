import { attendanceSeries, classesNeedingAttention, deriveKpis, fillRates, revenueSeries, subjectTrend, type AnalyticsReport } from "@/features/analytics/derive";

const campusStats = (o: Partial<AnalyticsReport["campus"]["CS1_XALA"]>) => ({
  attendance_rate: 90,
  collected_month: 0,
  issued_month: 0,
  outstanding: 0,
  classes: 2,
  new_students_month: 0,
  ...o,
});

const month = (m: string, o: Partial<AnalyticsReport["monthly"][number]> = {}) => ({
  month: m,
  new_students: 0,
  active_students: 0,
  retained: null,
  retention_base: null,
  collected: 0,
  issued: 0,
  outstanding: 0,
  ...o,
});

const report: AnalyticsReport = {
  students_by_campus: { CS1_XALA: 60, CS2_NGOTHINHAM: 40 },
  subjects_by_campus: { luyen_chu: { CS1_XALA: 30, CS2_NGOTHINHAM: 10 } },
  fill: [
    { subject: "toan_tu_duy", classes: 2, classes_with_capacity: 1, capacity: 20, students: 35, students_in_capped: 15 },
    { subject: "tien_tieu_hoc", classes: 1, classes_with_capacity: 0, capacity: 0, students: 12, students_in_capped: 0 },
  ],
  monthly: [
    month("2026-07", { active_students: 80, retained: 70, retention_base: 75 }),
    month("2026-08", { active_students: 82, retained: 76, retention_base: 80 }),
    month("2026-09", { active_students: 85, retained: 78, retention_base: 82, collected: 90_000_000, outstanding: 5_000_000 }),
    month("2026-10", { new_students: 6, active_students: 90, retained: 80, retention_base: 85, collected: 70_000_000, outstanding: 12_000_000 }),
  ],
  weekly: [
    { week: "2026-10-19", campus: "CS1_XALA", present: 80, late: 10, absent: 10, excused: 4 },
    { week: "2026-10-19", campus: "CS2_NGOTHINHAM", present: 45, late: 0, absent: 5, excused: 0 },
    { week: "2026-10-26", campus: "CS1_XALA", present: 85, late: 5, absent: 10, excused: 2 },
  ],
  classes: [
    { campus: "CS1_XALA", class_name: "K1A", students: 12, records: 60, absent_rate: 18, late_rate: 2, prev_absent_rate: 10 },
    { campus: "CS1_XALA", class_name: "K1B", students: 10, records: 50, absent_rate: 8, late_rate: 1, prev_absent_rate: 2 },
    { campus: "CS2_NGOTHINHAM", class_name: "T2A", students: 9, records: 45, absent_rate: 5, late_rate: 0, prev_absent_rate: 4 },
    { campus: "CS2_NGOTHINHAM", class_name: "T2B", students: 3, records: 6, absent_rate: 50, late_rate: 0, prev_absent_rate: null },
  ],
  campus: { CS1_XALA: campusStats({ outstanding: 8_000_000 }), CS2_NGOTHINHAM: campusStats({ outstanding: 4_000_000 }) },
  funnel: { leads: 40, trialed: 20, enrolled: 12, enrolled_after_trial: 10, lost: 8, open: 20 },
  interest: [{ month: "2026-10", subject: "toan_tu_duy", leads: 7 }],
  enroll_subjects: [{ month: "2026-10", subject: "toan_tu_duy", students: 3 }],
  generated_at: "2026-10-28T05:00:00Z",
  today: "2026-10-28",
  from_month: "2026-07",
  from_week: "2026-08-10",
};

describe("KPI tổng quan", () => {
  const k = deriveKpis(report);
  test("sĩ số, học sinh mới, đang đi học & chênh lệch so với tháng trước", () => {
    expect(k.students).toBe(100);
    expect(k.newThisMonth).toBe(6);
    expect(k.activeThisMonth).toBe(90);
    expect(k.activeDelta).toBe(5);
  });
  test("giữ chân: tháng này 80/85; trung bình 3 tháng trọn vẹn trước đó (76+78+70)/(80+82+75)", () => {
    expect(k.retentionNow).toBe(94.1);
    expect(k.retention3m).toBe(94.5); // (70 + 76 + 78) / (75 + 80 + 82) = 224 / 237 = 94,51%
  });
  test("chuyên cần 4 tuần = (có mặt + muộn) / (có mặt + muộn + nghỉ không phép), không tính nghỉ có phép", () => {
    expect(k.attendanceRate).toBe(Math.round(((80 + 10 + 45 + 85 + 5) / (80 + 10 + 10 + 45 + 5 + 85 + 5 + 10)) * 1000) / 10);
  });
  test("chuyển đổi: học thử → nhập học 10/20; tư vấn đã kết thúc → nhập học 12/(40−20)", () => {
    expect(k.trialConversion).toBe(50);
    expect(k.leadConversion).toBe(60);
  });
  test("công nợ cộng 2 cơ sở", () => {
    expect(k.outstandingTotal).toBe(12_000_000);
  });
});

describe("Số liệu biểu đồ", () => {
  test("doanh thu theo tháng giữ đúng thứ tự + nhãn ngắn", () => {
    const s = revenueSeries(report);
    expect(s.map((x) => x.label)).toEqual(["T7/26", "T8/26", "T9/26", "T10/26"]);
    expect(s[3]).toMatchObject({ collected: 70_000_000, outstanding: 12_000_000 });
  });
  test("chuyên cần theo tuần từng cơ sở; tuần không có dữ liệu cơ sở → null (không vẽ 0% giả)", () => {
    const s = attendanceSeries(report);
    expect(s[0]).toMatchObject({ week: "2026-10-19", CS1_XALA: 90, CS2_NGOTHINHAM: 90, absent: 15, excused: 4 });
    expect(s[1]!.CS2_NGOTHINHAM).toBeNull();
  });
  test("lớp cần chú ý: nghỉ ≥ 15% hoặc tăng ≥ 5 điểm; bỏ lớp quá ít dữ liệu", () => {
    const c = classesNeedingAttention(report).map((x) => x.class_name);
    expect(c).toEqual(["K1A", "K1B"]); // K1A 18%; K1B tăng 6 điểm; T2B chỉ 6 lượt → bỏ
  });
  test("lấp đầy chỉ tính lớp đã đặt sĩ số tối đa; môn chưa đặt → null", () => {
    const f = fillRates(report);
    expect(f.map((x) => [x.subject, x.rate])).toEqual([
      ["tien_tieu_hoc", null],
      ["toan_tu_duy", 75],
    ]);
  });
  test("xu hướng môn = phụ huynh hỏi tư vấn + học sinh mới đăng ký", () => {
    const t = subjectTrend(report);
    expect(t[3]).toMatchObject({ toan_tu_duy: 10, toan_tu_duy_leads: 7, toan_tu_duy_enrolled: 3, luyen_chu: 0 });
  });
});

import { weeklyDigest } from "@/features/analytics/digest";

describe("Báo cáo tuần tự động", () => {
  const d = weeklyDigest({ ...report, this_week: { from: "2026-10-26", collected: 41_000_000, new_students: 2 }, leads_this_week: 7 }, "https://app.thedu.edu.vn/");
  test("tiêu đề có khoảng tuần, thực thu tuần, sĩ số", () => {
    expect(d.title.replace(/\s/g, " ")).toBe("Báo cáo tuần 26/10 – 28/10: thu 41.000.000 ₫ · 100 học sinh");
    expect(d.weekKey).toBe("2026-10-26");
  });
  test("nội dung có tuyển sinh + lớp cần chú ý; email có link tới trang phân tích, không có thẻ HTML lạ", () => {
    expect(d.lines.some((l) => l.startsWith("Tuyển sinh: 7 phụ huynh mới"))).toBe(true);
    expect(d.lines.at(-1)).toContain("K1A");
    expect(d.html).toContain('href="https://app.thedu.edu.vn/admin/analytics"');
    expect(d.html).not.toMatch(/<script/i);
  });
});
