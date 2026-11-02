// VietQR (chuẩn NAPAS 247 / EMVCo) — sinh chuỗi QR chuyển khoản ngay trên máy, không gọi dịch vụ ngoài.
// App ngân hàng / ví tại Việt Nam quét được: tự điền ngân hàng, số tài khoản, số tiền, nội dung chuyển khoản.

/** Ngân hàng phổ biến (mã BIN NAPAS). */
export const VN_BANKS = [
  { bin: "970436", code: "VCB", name: "Vietcombank" },
  { bin: "970415", code: "ICB", name: "VietinBank" },
  { bin: "970418", code: "BIDV", name: "BIDV" },
  { bin: "970405", code: "VBA", name: "Agribank" },
  { bin: "970407", code: "TCB", name: "Techcombank" },
  { bin: "970422", code: "MB", name: "MB Bank" },
  { bin: "970416", code: "ACB", name: "ACB" },
  { bin: "970432", code: "VPB", name: "VPBank" },
  { bin: "970423", code: "TPB", name: "TPBank" },
  { bin: "970403", code: "STB", name: "Sacombank" },
  { bin: "970441", code: "VIB", name: "VIB" },
  { bin: "970437", code: "HDB", name: "HDBank" },
  { bin: "970443", code: "SHB", name: "SHB" },
  { bin: "970448", code: "OCB", name: "OCB" },
  { bin: "970426", code: "MSB", name: "MSB" },
  { bin: "970440", code: "SEAB", name: "SeABank" },
  { bin: "970431", code: "EIB", name: "Eximbank" },
  { bin: "970449", code: "LPB", name: "LPBank" },
] as const;

/** Bỏ dấu tiếng Việt, chỉ giữ chữ / số / khoảng trắng / gạch ngang — nội dung chuyển khoản an toàn với mọi ngân hàng. */
export function toTransferText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export const MAX_CONTENT = 50; // đa số ngân hàng nhận tối đa ~50 ký tự

/** Nội dung chuyển khoản: "[Mã học sinh] - [Họ tên] - [Tháng học]", vd "TH00012 - TRAN MINH AN - T11 2026". */
export function feeTransferContent(studentCode: string | null, fullName: string, month: string | null): string {
  const parts = [studentCode ?? "", toTransferText(fullName), month ? `T${month.slice(5, 7)} ${month.slice(0, 4)}` : ""].filter(Boolean);
  let text = parts.join(" - ");
  if (text.length > MAX_CONTENT) {
    // Rút gọn họ tên (giữ mã + tháng để đối soát)
    const fixed = [parts[0], parts[parts.length - 1]].join("").length + 6;
    const name = toTransferText(fullName).slice(0, Math.max(MAX_CONTENT - fixed, 6)).trim();
    text = [studentCode ?? "", name, month ? `T${month.slice(5, 7)} ${month.slice(0, 4)}` : ""].filter(Boolean).join(" - ");
  }
  return text.slice(0, MAX_CONTENT);
}

/**
 * Nội dung chuyển khoản do phụ huynh tự viết: luôn giữ MÃ HỌC SINH ở đầu (trung tâm tự đối soát tiền về theo mã này),
 * phần còn lại là lời ghi của phụ huynh — bỏ dấu, bỏ ký tự đặc biệt, cắt cho vừa giới hạn ngân hàng.
 * Phụ huynh lỡ gõ lại mã học sinh trong lời ghi → không lặp mã.
 */
export function customTransferContent(studentCode: string | null, note: string): string {
  const code = studentCode ? toTransferText(studentCode) : "";
  let text = toTransferText(note);
  if (code) text = text.replace(new RegExp(`(^|\\s)${code}(?=\\s|$)`, "g"), " ").replace(/\s+/g, " ").trim();
  return [code, text].filter(Boolean).join(" - ").slice(0, MAX_CONTENT).trim();
}

/** Phần lời ghi gợi ý (nội dung mặc định bỏ mã học sinh ở đầu) — điền sẵn vào ô cho phụ huynh sửa. */
export function defaultTransferNote(studentCode: string | null, fullName: string, month: string | null): string {
  const full = feeTransferContent(studentCode, fullName, month);
  return studentCode && full.startsWith(studentCode) ? full.slice(studentCode.length).replace(/^\s*-\s*/, "") : full;
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — trường 63 của EMVCo. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Chuỗi VietQR động (có số tiền + nội dung) — chuyển thành mã QR để phụ huynh quét. */
export function buildVietQR({ bin, accountNo, amount, content }: { bin: string; accountNo: string; amount: number; content: string }): string {
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", accountNo)) + tlv("02", "QRIBFTTA");
  const body =
    tlv("00", "01") +
    tlv("01", amount > 0 ? "12" : "11") + // 12 = QR động (1 lần, có số tiền)
    tlv("38", merchant) +
    tlv("53", "704") + // VND
    (amount > 0 ? tlv("54", String(Math.round(amount))) : "") +
    tlv("58", "VN") +
    (content ? tlv("62", tlv("08", toTransferText(content).slice(0, MAX_CONTENT))) : "") +
    "6304";
  return body + crc16(body);
}
