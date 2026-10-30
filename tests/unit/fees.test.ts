import { feeAfterExcused, monthLabel, perSessionPrice, previousMonth, schoolDaysInMonth } from "@/features/center/constants";
import { parseTransferContent } from "@/features/finance/reconcile";
import { computePayroll, effectiveRate, type RateRow, type SessionRecord } from "@/features/teaching/constants";
import { crc16, feeTransferContent, toTransferText } from "@/lib/vietqr";
import { formatVND } from "@/lib/utils";

/** Intl chèn khoảng trắng không ngắt (U+00A0) trước "₫" → chuẩn hoá để so sánh. */
const plain = (s: string) => s.replace(/\s/g, " ");

describe("Học phí theo buổi", () => {
  test("đếm buổi học trong tháng (Thứ 2 – Thứ 7, bỏ Chủ nhật)", () => {
    expect(schoolDaysInMonth("2026-10-01")).toBe(27); // 31 ngày, 4 Chủ nhật
    expect(schoolDaysInMonth("2027-02-01")).toBe(24); // 28 ngày, 4 Chủ nhật
    expect(schoolDaysInMonth("2028-02-01")).toBe(25); // năm nhuận: 29 ngày, 4 Chủ nhật
  });

  test("đơn giá 1 buổi = học phí tháng / số buổi, làm tròn tới 1.000đ", () => {
    expect(perSessionPrice(1_500_000, "2026-10-01")).toBe(56_000); // 55.555,6 → 56.000
    expect(perSessionPrice(1_200_000, "2027-02-01")).toBe(50_000); // đúng 50.000
    expect(perSessionPrice(0, "2026-10-01")).toBe(0);
  });

  test("trừ buổi nghỉ có phép, không bao giờ âm", () => {
    expect(feeAfterExcused(1_500_000, 0, 56_000)).toBe(1_500_000);
    expect(feeAfterExcused(1_500_000, 3, 56_000)).toBe(1_332_000);
    expect(feeAfterExcused(100_000, 5, 56_000)).toBe(0);
  });

  test("nhãn tháng và tháng liền trước (qua năm)", () => {
    expect(monthLabel("2026-10-01")).toBe("10/2026");
    expect(previousMonth("2026-01-01")).toBe("2025-12-01");
  });

  test("định dạng tiền Việt Nam", () => {
    expect(plain(formatVND(1_500_000))).toBe("1.500.000 ₫");
    expect(plain(formatVND(0))).toBe("0 ₫");
  });
});

describe("Nội dung chuyển khoản & đối soát ngân hàng", () => {
  test("bỏ dấu tiếng Việt, viết hoa, bỏ ký tự lạ", () => {
    expect(toTransferText("Trần Đức  Minh-An!")).toBe("TRAN DUC MINH-AN");
  });

  test("nội dung QR học phí: mã HS - họ tên - tháng, tối đa 50 ký tự", () => {
    expect(feeTransferContent("TH00012", "Trần Minh An", "2026-11-01")).toBe("TH00012 - TRAN MINH AN - T11 2026");
    const long = feeTransferContent("TH00012", "Nguyễn Hoàng Bảo Ngọc Phương Thảo Quỳnh Anh Thư", "2026-11-01");
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.startsWith("TH00012 - ")).toBe(true);
    expect(long.endsWith("T11 2026")).toBe(true); // giữ mã + tháng để đối soát
  });

  test("đọc mã học sinh + tháng từ nội dung ngân hàng đã biến đổi", () => {
    expect(parseTransferContent("MBVCB.123.TH00012 TRAN MINH AN T11 2026")).toEqual({ code: "TH00012", month: "2026-11-01" });
    expect(parseTransferContent("th00012 hoc phi t3/2027")).toEqual({ code: "TH00012", month: "2027-03-01" });
    expect(parseTransferContent("TH 00012 T112026")).toEqual({ code: "TH00012", month: "2026-11-01" }); // viết liền
  });

  test("không nhận nhầm mã / tháng sai", () => {
    expect(parseTransferContent("chuyen tien hoc").code).toBeNull();
    expect(parseTransferContent("TH000123 T11 2026").code).toBeNull(); // 6 chữ số
    expect(parseTransferContent("TH00012 T13 2026").month).toBeNull(); // tháng 13
  });

  test("nội dung QR tạo ra → ngân hàng gửi lại → đọc đúng (khứ hồi)", () => {
    const content = feeTransferContent("TH00345", "Lê Gia Huy", "2026-12-01");
    expect(parseTransferContent(`NAPAS 970422 ${content.toLowerCase()} FT2633`)).toEqual({ code: "TH00345", month: "2026-12-01" });
  });

  test("CRC-16/CCITT-FALSE của mã VietQR (vector chuẩn)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("Lương giáo viên theo buổi", () => {
  const rates: RateRow[] = [
    { subject: "luyen_chu", teacher_id: null, rate: 150_000 },
    { subject: "tong_hop", teacher_id: null, rate: 120_000 },
    { subject: "toan_tu_duy", teacher_id: "t1", rate: 200_000 },
  ];

  test("đơn giá: riêng giáo viên > mặc định môn > mặc định tổng hợp", () => {
    expect(effectiveRate(rates, "t1", "toan_tu_duy")).toBe(200_000);
    expect(effectiveRate(rates, "t2", "luyen_chu")).toBe(150_000);
    expect(effectiveRate(rates, "t2", "tien_tieu_hoc")).toBe(120_000);
    expect(effectiveRate([], "t2", "luyen_chu")).toBeNull();
  });

  const session = (o: Partial<SessionRecord> & { id: string; status: string; subject: string; teacher_id?: string }): SessionRecord & { teacher_id: string } => ({
    teacher_id: "t1",
    class_id: "c1",
    class_name: "K1A",
    campus: "CS1_XALA",
    date: "2026-10-26",
    scheduled_start: "18:00",
    scheduled_end: "19:30",
    checked_in_at: null,
    checked_out_at: null,
    off_schedule: false,
    rate: null,
    note: null,
    ...o,
  });

  test("tổng = Σ buổi hợp lệ × đơn giá; ca huỷ không tính; ca chốt đơn giá cũ tách dòng", () => {
    const [row] = computePayroll(
      [{ id: "t1", full_name: "Cô Hà", phone: null, campus: null }],
      [
        session({ id: "a", status: "completed", subject: "luyen_chu", rate: 140_000 }), // chốt giá cũ
        session({ id: "b", status: "completed", subject: "luyen_chu" }), // giá hiện hành 150.000
        session({ id: "c", status: "manual", subject: "toan_tu_duy" }), // 200.000 riêng cô
        session({ id: "d", status: "missed_checkout", subject: "luyen_chu" }), // vẫn tính, đánh dấu xem lại
        session({ id: "e", status: "cancelled", subject: "luyen_chu" }), // không tính
      ],
      rates,
    );
    expect(row!.sessions).toBe(4);
    expect(row!.amount).toBe(140_000 + 150_000 + 200_000 + 150_000);
    expect(row!.lines).toHaveLength(3); // luyện chữ 140k, luyện chữ 150k, toán 200k
    expect(row!.flagged).toBe(1);
    expect(row!.missingRate).toBe(false);
  });

  test("môn chưa có đơn giá → tính 0đ và báo thiếu đơn giá", () => {
    const [row] = computePayroll([{ id: "t9", full_name: "Thầy Nam", phone: null, campus: null }], [session({ id: "x", teacher_id: "t9", status: "completed", subject: "toan_tu_duy" })], []);
    expect(row!.amount).toBe(0);
    expect(row!.missingRate).toBe(true);
  });
});
