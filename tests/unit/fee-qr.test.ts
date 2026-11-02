import { notificationHref } from "@/features/notifications/format";
import { buildVietQR, crc16, feeTransferContent } from "@/lib/vietqr";

const CHILD = "11111111-1111-4111-8111-111111111111";
const FEE = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-02";

/** Đọc các trường TLV (id 2 số + độ dài 2 số + giá trị) của chuỗi EMVCo. */
function tlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

describe("Thông báo học phí → mở mã QR của đúng khoản", () => {
  test("phát hành / nhắc học phí: kèm ?pay=<mã khoản> + cuộn tới khoản đó", () => {
    for (const type of ["fee_issued", "fee_reminder"] as const) {
      const href = notificationHref({ type, student_id: CHILD, ref_date: TODAY, ref_id: FEE }, TODAY);
      expect(href).toBe(`/parent/fees?child=${CHILD}&pay=${FEE}#fee-${FEE}`);
    }
  });
  test("đã thanh toán: chỉ mở trang học phí, không bật QR", () => {
    const href = notificationHref({ type: "fee_paid", student_id: CHILD, ref_date: TODAY, ref_id: FEE }, TODAY);
    expect(href).not.toContain("pay=");
  });
  test("thông báo cũ không có mã khoản → trang học phí của bé", () => {
    expect(notificationHref({ type: "fee_issued", student_id: CHILD, ref_date: TODAY, ref_id: null }, TODAY)).toBe(`/parent/fees?child=${CHILD}`);
  });
});

describe("Mã VietQR điền sẵn số tiền", () => {
  const payload = buildVietQR({ bin: "970436", accountNo: "0123456789", amount: 1_850_000, content: feeTransferContent("TH00012", "Trần Minh An", "2026-11-01") });
  const f = tlv(payload);

  test("QR động có đúng số tiền còn phải đóng (trường 54) và đơn vị VND", () => {
    expect(f["01"]).toBe("12");
    expect(f["54"]).toBe("1850000");
    expect(f["53"]).toBe("704");
  });
  test("đúng ngân hàng + số tài khoản nhận tiền của trung tâm", () => {
    const merchant = tlv(f["38"]!);
    expect(tlv(merchant["01"]!)).toEqual({ "00": "970436", "01": "0123456789" });
  });
  test("nội dung chuyển khoản không dấu để đối soát + CRC hợp lệ", () => {
    expect(tlv(f["62"]!)["08"]).toBe("TH00012 - TRAN MINH AN - T11 2026");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });
});
