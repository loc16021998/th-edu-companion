# Kiểm thử TH EDU Companion

| Lệnh | Chạy gì | Cần gì |
|---|---|---|
| `npm test` | Unit test (Jest) — `tests/unit/` | Không cần mạng / Supabase |
| `npm run test:e2e` | E2E (Playwright) — `tests/e2e/` | Chrome đã cài; tài khoản test (tuỳ kịch bản) |
| `npm run test:e2e:ui` | E2E ở chế độ giao diện (xem từng bước, debug) | như trên |

## Unit test (Jest)
- Cấu hình: `jest.config.mjs` (biên dịch bằng SWC của Next.js, hiểu alias `@/`). Biến Supabase giả trong `tests/setup-env.ts` — unit test **không bao giờ** gọi Supabase thật.
- Đang có:
  - `fees.test.ts` — học phí theo buổi / trừ buổi nghỉ có phép, định dạng tiền, nội dung chuyển khoản VietQR ↔ đọc lại khi đối soát ngân hàng, CRC mã QR, lương giáo viên theo buổi.
  - `date.test.ts` — cộng ngày qua tháng/năm/năm nhuận, đầu tuần Thứ Hai, ngày Việt Nam (UTC+7), Chủ nhật nghỉ, trạng thái buổi học 18:00–19:30.
  - `daily-report-schema.test.ts` — validate form sổ liên lạc (nội dung tối thiểu, sao 1–5, giới hạn ký tự, ảnh đúng học sinh, ngày không Chủ nhật / tương lai).
- Hàm phụ thuộc "hôm nay" → dùng `jest.useFakeTimers().setSystemTime(...)` để test không phụ thuộc ngày chạy.

## E2E (Playwright)
- Cấu hình: `playwright.config.ts`. Mặc định tự `npm run build` + chạy bản production ở cổng 3100 (dev server cổng 3000 không bị ảnh hưởng), giả lập điện thoại Pixel 7 trên Chrome đã cài.
  Máy chưa có Chrome / chạy CI: `npx playwright install chromium` rồi đặt `PW_CHANNEL=` (rỗng).
- **Luôn chạy được** (không đăng nhập, không ghi dữ liệu): `smoke.spec.ts` — chặn trang khi chưa đăng nhập, trang đăng nhập, `/api/health`.
- **Cần tài khoản test** — sao chép `.env.e2e.example` → `.env.e2e`, điền:
  - `login.spec.ts`: phụ huynh vào `/parent/dashboard`, giáo viên vào `/teacher/dashboard`, phụ huynh không vào được khu giáo viên, sai mật khẩu báo lỗi.
  - `attendance.spec.ts`: giáo viên đổi trạng thái điểm danh của `E2E_STUDENT_NAME` (Có mặt ↔ Đi muộn) → lưu → phụ huynh thấy đúng trạng thái ở trang Chuyên cần → **khôi phục trạng thái cũ**. Ghi dữ liệu nên chỉ chạy khi `E2E_ALLOW_WRITES=1`.
- Thiếu tài khoản → test được **bỏ qua** (skipped) kèm lý do, không báo lỗi.

### Dữ liệu test — nên dùng project Supabase riêng
Kịch bản điểm danh ghi dữ liệu và gửi thông báo cho phụ huynh test. Khuyến nghị:
1. Tạo project Supabase thử nghiệm, chạy các file `supabase/apply-*.sql`.
2. Tạo 1 lớp, 1 giáo viên được phân công lớp đó, 1 phụ huynh + 1 học sinh trong lớp (Admin → Quản lý tài khoản & phân lớp).
3. Trỏ `.env.local` vào project thử nghiệm khi chạy E2E (hoặc deploy bản staging và đặt `E2E_BASE_URL`).
Nếu buộc phải chạy trên dữ liệu thật: dùng tài khoản + học sinh **dành riêng cho test**, không dùng bé thật.

### Khi test lỗi
`tests/e2e/.report/index.html` (báo cáo), `tests/e2e/.results/` (ảnh chụp + trace). Xem trace: `npx playwright show-trace <đường-dẫn>/trace.zip`.

## CI
`.github/workflows/test.yml`: mỗi lần đẩy code / mở PR chạy kiểm tra kiểu, lint, unit test. E2E chạy khi repo có secret `E2E_SUPABASE_URL` (project thử nghiệm) — xem file workflow.
