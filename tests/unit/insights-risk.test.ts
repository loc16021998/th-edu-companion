import { addDays } from "@/lib/date";
import { analyzeStudent, signalsFingerprint, type ReportRow, type StudentWindow } from "@/features/insights/risk";
import { ruleInterventions } from "@/features/insights/interventions";
import { buildTemplate360, homeworkStats } from "@/features/insights/report360";

const TODAY = "2026-11-03";
const d = (n: number) => addDays(TODAY, -n);
const empty: StudentWindow = { attendance: [], reports: [], homework: [] };
const report = (daysAgo: number, toan?: number, extra: Partial<ReportRow> = {}): ReportRow => ({
  date: d(daysAgo),
  mood: null,
  note: null,
  subjects: toan ? { toan_tu_duy: { rating: toan, criteria: {}, comment: "" } } : {},
  ...extra,
});

describe("Không có dấu hiệu bất thường", () => {
  test("đi học đều, điểm ổn định → ok, không cảnh báo", () => {
    const w: StudentWindow = {
      attendance: [1, 2, 3, 4, 5].map((n) => ({ date: d(n), status: "present" as const })),
      reports: [20, 18, 16, 5, 3, 1].map((n) => report(n, 4)),
      homework: [{ title: "Bài 1", subject: null, dueDate: d(5), submittedOn: d(6) }],
    };
    expect(analyzeStudent(w, TODAY)).toEqual({ level: "ok", score: 0, signals: [] });
  });
});

describe("Chuyên cần", () => {
  test("nghỉ 3 buổi liên tiếp → cảnh báo; vẫn đang nghỉ → mức cao", () => {
    const w = { ...empty, attendance: [{ date: d(6), status: "present" as const }, ...[3, 2, 1].map((n) => ({ date: d(n), status: "absent" as const }))] };
    const r = analyzeStudent(w, TODAY);
    expect(r.signals[0]).toMatchObject({ kind: "absence_streak", severity: "high", title: "Nghỉ 3 buổi liên tiếp" });
    expect(r.level).toBe("high");
  });
  test("nghỉ có phép cũng tính; đã đi học lại sau 3 buổi nghỉ → mức trung bình", () => {
    const w = { ...empty, attendance: [...[8, 7, 6].map((n) => ({ date: d(n), status: "absent_with_permission" as const })), { date: d(2), status: "present" as const }] };
    expect(analyzeStudent(w, TODAY).signals[0]).toMatchObject({ kind: "absence_streak", severity: "medium" });
  });
  test("nghỉ rải rác 4 buổi (không liên tiếp) → lưu ý tổng số buổi nghỉ", () => {
    const w = { ...empty, attendance: [20, 18, 12, 4].flatMap((n) => [{ date: d(n), status: "absent" as const }, { date: d(n - 1), status: "present" as const }]) };
    expect(analyzeStudent(w, TODAY).signals[0]).toMatchObject({ kind: "absence_total", title: "Nghỉ 4 buổi trong 30 ngày" });
  });
});

describe("Đánh giá môn học", () => {
  test("Toán tư duy từ 4.5★ xuống 2★ → đi xuống, mức cao", () => {
    const w = { ...empty, reports: [...[25, 22, 19].map((n) => report(n, 5)), ...[18].map((n) => report(n, 4)), ...[6, 4, 2].map((n) => report(n, 2))] };
    expect(analyzeStudent(w, TODAY).signals).toContainEqual(expect.objectContaining({ kind: "rating_drop", subject: "toan_tu_duy", severity: "high" }));
  });
  test("giảm nhẹ nhưng vẫn cao (5★ → 4★) → không cảnh báo", () => {
    const w = { ...empty, reports: [...[25, 20].map((n) => report(n, 5)), ...[5, 2].map((n) => report(n, 4))] };
    expect(analyzeStudent(w, TODAY).signals).toEqual([]);
  });
  test("tiêu chí thấp → ghi kèm để gợi ý đúng việc", () => {
    const low = (n: number): ReportRow => report(n, undefined, { subjects: { toan_tu_duy: { criteria: { tinh_nham: 2 }, comment: "" } } });
    const r = analyzeStudent({ ...empty, reports: [low(3), low(1)] }, TODAY);
    expect(r.signals[0]).toMatchObject({ subject: "toan_tu_duy", criterion: "tinh_nham" });
    expect(ruleInterventions("An", r.signals)[0]).toMatch(/đố tính nhẩm/);
  });
  test('nhận xét "cần cố gắng / chưa tập trung" lặp lại ≥3 buổi (gõ có dấu hay không) → lưu ý', () => {
    const notes = ["Con cần cố gắng hơn", "Hôm nay con chưa tập trung", "con hay noi chuyen trong gio"];
    const w = { ...empty, reports: notes.map((note, i) => report(i + 1, undefined, { note })) };
    expect(analyzeStudent(w, TODAY).signals).toContainEqual(expect.objectContaining({ kind: "low_focus" }));
  });
});

describe("Bài tập về nhà", () => {
  test("chưa nộp 2/3 bài đã đến hạn → cảnh báo", () => {
    const w = {
      ...empty,
      homework: [
        { title: "A", subject: null, dueDate: d(10), submittedOn: null },
        { title: "B", subject: null, dueDate: d(6), submittedOn: null },
        { title: "C", subject: null, dueDate: d(3), submittedOn: d(4) },
      ],
    };
    expect(analyzeStudent(w, TODAY).signals[0]).toMatchObject({ kind: "homework", severity: "medium", title: "Chưa nộp 2/3 bài tập" });
  });
  test("bài chưa đến hạn không tính; nộp muộn được tính", () => {
    const w = {
      ...empty,
      homework: [
        { title: "A", subject: null, dueDate: d(10), submittedOn: d(8) },
        { title: "B", subject: null, dueDate: d(6), submittedOn: d(5) },
        { title: "C", subject: null, dueDate: addDays(TODAY, 2), submittedOn: null },
      ],
    };
    expect(analyzeStudent(w, TODAY).signals[0]).toMatchObject({ kind: "homework", title: "Nộp muộn 2/2 bài tập" });
  });
});

test("dấu vân tay không đổi khi chỉ đổi thứ tự cảnh báo", () => {
  const a = { kind: "homework" as const, severity: "medium" as const, title: "", detail: "" };
  const b = { kind: "low_focus" as const, severity: "watch" as const, title: "", detail: "" };
  expect(signalsFingerprint([a, b])).toBe(signalsFingerprint([b, a]));
});

describe("Nhận xét chiều sâu 360° (bản theo mẫu)", () => {
  const data = {
    childName: "An",
    className: "K1A",
    from: d(29),
    to: TODAY,
    monthStart: "2026-11-01",
    attendance: { present: 18, late: 2, absent: 1, excused: 1, absentNotes: [] },
    moods: {},
    subjects: [
      { key: "tien_tieu_hoc" as const, name: "Tiền tiểu học", avg: 4.5, criteria: [{ label: "Ghép vần", avg: 4.6 }], comments: [] },
      { key: "toan_tu_duy" as const, name: "Toán tư duy", avg: 2.8, criteria: [{ label: "Khả năng tính nhẩm", avg: 2.4 }], comments: [] },
    ],
    teacherNotes: [],
    reportCount: 20,
  };
  const hw = homeworkStats(
    [
      { title: "A", subject: null, dueDate: d(10), submittedOn: d(11) },
      { title: "B", subject: null, dueDate: d(5), submittedOn: null },
    ],
    TODAY,
  );
  const text = buildTemplate360(data, hw, []);

  test("đủ 4 phần, khen điểm mạnh trước, nêu đúng số liệu", () => {
    expect(text.indexOf("🌟 Điểm mạnh")).toBeLessThan(text.indexOf("🌱 Điều con cần cải thiện"));
    expect(text).toContain("ghép vần (Tiền tiểu học)");
    expect(text).toContain("khả năng tính nhẩm (Toán tư duy)");
    expect(text).toContain("đi học 20/22 buổi (2 buổi đến muộn), nghỉ 2 buổi");
    expect(text).toContain("2 bài đã đến hạn: 1 bài nộp đúng hạn, 0 bài nộp muộn, 1 bài chưa nộp");
    expect(text).toMatch(/🏡 Ba mẹ đồng hành[\s\S]*tính nhẩm/);
  });
  test("vừa 1 tin nhắn (≤ 1900 ký tự)", () => {
    expect(text.length).toBeLessThanOrEqual(1900);
  });
});
