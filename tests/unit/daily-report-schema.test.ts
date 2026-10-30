import { dailyReportFormSchema, subjectsSummarySchema, type DailyReportFormValues } from "@/features/daily-reports/schema";

const STUDENT = "7f1c2a3b-1111-4222-8333-444455556666";
const OTHER = "0a0b0c0d-aaaa-4bbb-8ccc-ddddeeeeffff";
const empty = { rating: null, comment: "", criteria: {} };

/** Form hợp lệ tối thiểu: chỉ chọn tâm trạng. Ngày 28/10/2026 (Thứ Tư) = "hôm nay" (giờ giả lập). */
function form(overrides: Partial<DailyReportFormValues> = {}): DailyReportFormValues {
  return {
    studentId: STUDENT,
    classKey: "CS1_XALA:K1A",
    date: "2026-10-28",
    mood: "happy",
    subjects: { tien_tieu_hoc: { ...empty }, luyen_chu: { ...empty }, toan_tu_duy: { ...empty } },
    teacherNote: "",
    media: [],
    applyNoteToClass: false,
    ...overrides,
  };
}

/** Thông điệp lỗi theo đường dẫn ô (vd. "teacherNote", "subjects.luyen_chu.rating"). */
function errorsOf(values: unknown): Record<string, string> {
  const res = dailyReportFormSchema.safeParse(values);
  if (res.success) return {};
  return Object.fromEntries(res.error.issues.map((i) => [i.path.join("."), i.message]));
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-28T05:00:00Z")); // 12:00 giờ VN
});
afterAll(() => jest.useRealTimers());

describe("Form sổ liên lạc hằng ngày", () => {
  test("hợp lệ khi có ít nhất 1 nội dung", () => {
    expect(errorsOf(form())).toEqual({});
    expect(errorsOf(form({ mood: null, teacherNote: "Bé ngoan, viết chữ đẹp" }))).toEqual({});
    expect(errorsOf(form({ mood: null, subjects: { ...form().subjects, luyen_chu: { rating: 4, comment: "", criteria: {} } } }))).toEqual({});
    expect(errorsOf(form({ mood: null, media: [`${STUDENT}/2026-10-28/anh-1.jpg`] }))).toEqual({});
  });

  test("báo lỗi khi không có nội dung nào (nhận xét chỉ có khoảng trắng cũng tính là trống)", () => {
    expect(errorsOf(form({ mood: null, teacherNote: "   " }))).toEqual({
      teacherNote: "Hãy nhập ít nhất một nội dung: tâm trạng, đánh giá môn, nhận xét hoặc ảnh.",
    });
  });

  test("sao đánh giá 1–5, nhận xét môn ≤ 500 ký tự, nhận xét chung ≤ 2000 ký tự", () => {
    const subjects = form().subjects;
    expect(errorsOf(form({ subjects: { ...subjects, toan_tu_duy: { rating: 6, comment: "", criteria: {} } } }))).toEqual({
      "subjects.toan_tu_duy.rating": "Từ 1 đến 5 sao",
    });
    expect(errorsOf(form({ subjects: { ...subjects, luyen_chu: { rating: null, comment: "a".repeat(501), criteria: {} } } }))).toEqual({
      "subjects.luyen_chu.comment": "Tối đa 500 ký tự",
    });
    expect(errorsOf(form({ teacherNote: "a".repeat(2001) }))).toEqual({ teacherNote: "Nhận xét tối đa 2000 ký tự" });
  });

  test("ảnh / video: đúng thư mục của học sinh, đúng định dạng, tối đa 20", () => {
    expect(errorsOf(form({ media: [`${OTHER}/2026-10-28/anh.jpg`] }))).toEqual({ media: "Có ảnh/video không thuộc học sinh này" });
    expect(errorsOf(form({ media: [`${STUDENT}/2026-10-28/virus.exe`] }))).toEqual({ "media.0": "Đường dẫn ảnh/video không hợp lệ" });
    const many = Array.from({ length: 21 }, (_, i) => `${STUDENT}/2026-10-28/anh-${i}.jpg`);
    expect(errorsOf(form({ media: many }))).toEqual({ media: "Tối đa 20 ảnh/video" });
  });

  test("áp nhận xét cho cả lớp thì phải có nhận xét", () => {
    expect(errorsOf(form({ applyNoteToClass: true }))).toEqual({ teacherNote: "Nhập nhận xét chung để áp dụng cho cả lớp." });
    expect(errorsOf(form({ applyNoteToClass: true, teacherNote: "Cả lớp học tốt" }))).toEqual({});
  });

  test("ngày: không Chủ nhật, không tương lai, phải là ngày có thật", () => {
    expect(errorsOf(form({ date: "2026-10-25" }))).toEqual({ date: "Chủ nhật không có buổi học (lịch học Thứ 2 – Thứ 7)" });
    expect(errorsOf(form({ date: "2026-10-29" }))).toEqual({ date: "Không thể chọn ngày trong tương lai" });
    expect(Object.keys(errorsOf(form({ date: "2026-02-30" })))).toEqual(["date"]);
  });

  test("mã học sinh phải là UUID", () => {
    expect(errorsOf(form({ studentId: "abc", media: [] }))).toMatchObject({ studentId: "Mã học sinh không hợp lệ" });
  });
});

describe("Đọc sổ liên lạc đã lưu (JSONB)", () => {
  test("bỏ qua môn lạ, điểm tiêu chí hỏng không làm hỏng cả bản ghi", () => {
    const parsed = subjectsSummarySchema.parse({
      luyen_chu: { rating: 5, comment: "Đẹp", criteria: { deu_net: 9 } },
      mon_la: { rating: 3 },
    });
    expect(parsed).toEqual({ luyen_chu: { rating: 5, comment: "Đẹp", criteria: {} } });
  });

  test("bản ghi cũ thiếu nhận xét / tiêu chí → giá trị mặc định", () => {
    expect(subjectsSummarySchema.parse({ toan_tu_duy: { rating: 4 } })).toEqual({ toan_tu_duy: { rating: 4, comment: "", criteria: {} } });
  });
});
