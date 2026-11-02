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
- **Cần project Supabase thử nghiệm + tài khoản test** (`.env.e2e`, xem bên dưới):
  - `login.spec.ts`: phụ huynh vào `/parent/dashboard`, giáo viên vào `/teacher/dashboard`, phụ huynh không vào được khu giáo viên, sai mật khẩu báo lỗi.
  - `tour.spec.ts`: đăng nhập phụ huynh / giáo viên / quản trị rồi mở **mọi trang** của vai trò đó — không lỗi JS, 5xx, CSP, hydration, không rơi vào màn hình lỗi, không tràn ngang trên điện thoại. Thêm trang mới → thêm vào danh sách `PAGES`.
  - `flows.spec.ts`: "Thanh toán ngay" (mã VietQR, tự viết nội dung chuyển khoản, khung cố định), mở QR từ thông báo học phí, Menu quản trị trên điện thoại → "Lịch hẹn trao đổi" (không bị nhảy về Tổng quan), đặt lịch hẹn phụ huynh → giáo viên xác nhận → phụ huynh thấy phòng họp → huỷ.
  - `attendance.spec.ts`: giáo viên đổi trạng thái điểm danh của `E2E_STUDENT_NAME` (Có mặt ↔ Đi muộn) → lưu → phụ huynh thấy đúng trạng thái → **khôi phục trạng thái cũ**.
  - Kịch bản GHI dữ liệu (điểm danh, đặt lịch) chỉ chạy khi `E2E_ALLOW_WRITES=1`.
- Chưa khai báo `E2E_SUPABASE_URL` → mọi kịch bản cần đăng nhập được **bỏ qua** (skipped) kèm lý do — không bao giờ đăng nhập / ghi vào dữ liệu thật.

### Dựng project Supabase thử nghiệm (1 lần)
**Nhanh nhất:** `cp .env.e2e.example .env.e2e` → điền `E2E_SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens) → `npm run e2e:setup`:
script tự tạo project `th-edu-test` (Singapore, gói Free), ghi URL + khoá vào `.env.e2e`, nạp schema + dữ liệu test, kiểm tra đăng nhập. Rồi `npm run test:e2e`.

Làm bằng tay:
1. supabase.com → **New project** (gói Free) — đặt tên vd. `th-edu-test`. **Không** dùng project của trung tâm.
2. `cp .env.e2e.example .env.e2e` (tài khoản test đã điền sẵn) → điền `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY` của project mới (Project Settings → Data API / API Keys).
3. Nạp schema + dữ liệu test, chọn 1 cách:
   - Tự động: điền `E2E_SUPABASE_ACCESS_TOKEN` (Account → Access Tokens) rồi chạy `npm run e2e:setup`.
   - Bằng tay: SQL Editor của project thử nghiệm → lần lượt chạy `supabase/schema.sql`, `supabase/seed/demo.sql`, `supabase/seed/e2e.sql` → `npm run e2e:setup` để kiểm tra.
4. `npm run test:e2e`. Playwright tự build app với project thử nghiệm ra `.next-e2e` (không đụng `.env.local`, `.next` của bản thật) và chạy ở cổng 3100.

An toàn: `playwright.config.ts` và `e2e:setup` dừng ngay nếu `E2E_SUPABASE_URL` trùng project trong `.env.local` (dữ liệu thật).
`supabase/schema.sql` = ghép mọi migration — sau khi thêm migration chạy `npm run db:schema` (CI báo lỗi nếu quên).

### Khi test lỗi
`tests/e2e/.report/index.html` (báo cáo), `tests/e2e/.results/` (ảnh chụp + trace). Xem trace: `npx playwright show-trace <đường-dẫn>/trace.zip`.

## CI
`.github/workflows/test.yml`: mỗi lần đẩy code / mở PR chạy kiểm tra kiểu, lint, unit test. E2E chạy khi repo có secret `E2E_SUPABASE_URL` (project thử nghiệm) — xem file workflow.
