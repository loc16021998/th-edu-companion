# TH EDU Companion — Sổ liên lạc thông minh

Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Lucide · Supabase (`@supabase/ssr`)

## Cấu trúc thư mục

```
th-edu-companion/
├── supabase/
│   ├── migrations/                                 # Migration chính thức (Supabase CLI), chạy theo thứ tự
│   ├── seed/demo.sql, demo-remove.sql              # Dữ liệu demo (tạo / gỡ)
│   └── schema.sql                                  # Ghép tất cả migrations, để dán vào SQL Editor
├── src/
│   ├── app/                      # Presentation — routes (App Router)
│   │   ├── (auth)/login/         # Trang đăng nhập
│   │   ├── (dashboard)/          # Layout có header, yêu cầu đăng nhập
│   │   │   ├── admin/            # requireRole("admin")
│   │   │   ├── teacher/          # requireRole("teacher", "admin")
│   │   │   └── parent/           # requireRole("parent")
│   │   ├── layout.tsx
│   │   └── page.tsx              # Điều hướng theo vai trò
│   ├── features/                 # Application — theo domain nghiệp vụ
│   │   ├── auth/                 #   queries.ts (đọc), actions.ts (server actions), components/
│   │   ├── students/
│   │   ├── attendance/
│   │   ├── daily-reports/        #   schema.ts: zod schema cho subjects_summary (JSONB)
│   │   ├── fees/
│   │   └── notifications/        #   Bản tin phụ huynh: queries, actions, chuông realtime
│   ├── components/
│   │   ├── ui/                   # shadcn/ui (sinh bằng `npx shadcn add ...`)
│   │   └── shared/               # Component dùng chung của app
│   ├── lib/                      # Infrastructure
│   │   ├── supabase/
│   │   │   ├── client.ts         # Client Components
│   │   │   ├── server.ts         # Server Components / Actions / Route Handlers
│   │   │   ├── middleware.ts     # Refresh session + chặn route chưa đăng nhập
│   │   │   └── admin.ts          # service_role — bỏ qua RLS, chỉ server
│   │   ├── env.ts
│   │   └── utils.ts
│   ├── config/constants.ts       # Nhãn tiếng Việt, campus, môn học
│   ├── types/database.types.ts   # Kiểu DB (tái tạo bằng `npm run db:types`)
│   └── middleware.ts
└── components.json               # Cấu hình shadcn/ui
```

Quy tắc phụ thuộc: `app → features → lib/types/config`. `features/*/queries.ts` chỉ chạy trên server (`server-only`);
`actions.ts` là Server Actions có validate bằng zod.

## Cài đặt

```bash
npm install
cp .env.example .env.local      # điền URL + anon key của project Supabase
```

### Áp dụng database

**Cách 1 — Supabase CLI (khuyến nghị):**

```bash
npx supabase init               # lần đầu, tạo supabase/config.toml
npx supabase link --project-ref <project-ref>
npx supabase db push
```

**Cách 2 — Dashboard:** mở SQL Editor, dán nội dung `supabase/schema.sql` và chạy.

### Tạo tài khoản admin đầu tiên

Mọi user mới tự động có role `parent` (role **không** đọc từ metadata để tránh tự nâng quyền).
Sau khi đăng ký user đầu tiên, chạy trong SQL Editor:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'admin@example.com');
```

### Phân công giáo viên

```sql
-- Phụ trách 1 lớp
insert into public.teacher_assignments (teacher_id, campus, class_name) values ('<uuid>', 'CS1_XALA', 'K1A');
-- Phụ trách toàn bộ cơ sở (class_name = null)
insert into public.teacher_assignments (teacher_id, campus) values ('<uuid>', 'CS2_NGOTHINHAM');
```

```bash
npm run dev
```

## Ma trận quyền (RLS)

| Bảng                  | Parent                      | Teacher (lớp/cơ sở được phân công) | Admin |
| --------------------- | --------------------------- | ---------------------------------- | ----- |
| `profiles`            | Xem/sửa chính mình; xem GV của con | Xem/sửa chính mình; xem PH của HS | ALL   |
| `teacher_assignments` | —                           | Xem phân công của mình             | ALL   |
| `students`            | Xem con mình                | Xem, sửa                           | ALL   |
| `attendance`          | Xem                         | Xem, thêm, sửa, xoá                | ALL   |
| `daily_reports`       | Xem                         | Xem, thêm/sửa (đứng tên mình), xoá bản của mình | ALL |
| `fees`                | Xem                         | Xem (ghi: bỏ comment trong migration) | ALL |
| `notifications`       | Xem, đánh dấu đã đọc (chỉ cột `read_at`), xoá — của mình | — (trigger tự tạo) | Xem |
| Storage `student-activities` (private) | Xem ảnh của con | Xem, upload, xoá (thư mục học sinh mình phụ trách) | ALL |

Không ai được tự đổi `role`/`campus` của mình (trigger `protect_profile_privileged_columns`).

## Ca học

- Quản trị viên tạo ca học tại `/admin/shifts` (tên, giờ bắt đầu/kết thúc, ngày trong tuần), tạm ngưng / xoá ca,
  và gán ca cho lớp ở `/admin/classes`. **Chỉ quản trị viên được tạo / sửa / xoá** (requireRole + RLS bảng `class_shifts`);
  giáo viên, phụ huynh chỉ xem.
- Tab Lịch học của phụ huynh hiển thị theo ca của lớp; lớp chưa gán ca (hoặc ca tạm ngưng) dùng lịch mặc định.
- Migration `20261026000000_class_shifts.sql` (file chạy một lần: `supabase/apply-class-shifts.sql`).

## Lịch học & khu Quản trị

- Lịch cố định: **Thứ 2 – Thứ 7, 18:00 – 19:30** (`src/lib/schedule.ts`). Chủ nhật không có buổi học:
  form chặn chọn Chủ nhật, DB có ràng buộc `*_school_day` cho điểm danh / sổ liên lạc / chấm công.
- Migration `20261023000000_classes_teacher_attendance.sql`: bảng `classes` (danh mục lớp, tự lấy các lớp đã có từ
  học sinh/phân công) và `teacher_attendance` (chấm công giáo viên theo buổi).
- Khu `/admin`: Tổng quan · Lớp học (tạo lớp, phân công GV, tạo tài khoản GV) · Học sinh (thêm HS, liên kết hoặc tạo
  tài khoản phụ huynh) · Học phí (tạo khoản thu cho 1 HS / cả lớp, ghi nhận đã đóng) · Chấm công giáo viên.
  Admin dùng chung màn Điểm danh học sinh và Sổ liên lạc với giáo viên.
- Tạo tài khoản đăng nhập mới (GV/PH) cần `SUPABASE_SERVICE_ROLE_KEY` trong môi trường server.

## Đăng nhập & cấp tài khoản

- Hai giao diện tách riêng:
  - **Phụ huynh** — đăng nhập tại `/login/parent`; **Giáo viên** — `/login/teacher` (hai trang riêng, màu riêng).
    `/login` là trang chọn "Tôi là phụ huynh / Tôi là giáo viên"; link cũ `/login?as=teacher` tự chuyển tiếp.
    Chỉ có đăng nhập, không có đăng ký.
  - **Quản trị viên** — đăng nhập tại `/admin/login`, khung giao diện riêng `src/app/(admin)/admin/(panel)`
    (menu trái trên máy tính). Điểm danh học sinh / sổ liên lạc của admin ở `/admin/attendance`, `/admin/daily-report`
    (dùng chung màn hình với giáo viên: `src/features/teacher/screens`).
- Mỗi khu chỉ một vai trò: `/admin` = admin, `/teacher` = giáo viên, `/parent` = phụ huynh. Đăng nhập sai trang/mục → không vào,
  hiện gợi ý trang đúng. Đăng xuất quay về đúng trang đăng nhập của vai trò.
- Quản trị viên cấp tài khoản tại `/admin/accounts`: tạo tài khoản phụ huynh / giáo viên (SĐT và/hoặc email + mật khẩu),
  đặt lại mật khẩu, xoá tài khoản. Tài khoản quản trị không sửa/xoá được tại đây.

## Bản tin / thông báo phụ huynh

- **Đã xem = hết hiện**: trang Bản tin có tab **Mới / Đã xem**; bấm thông báo → đánh dấu đã đọc. Mở trang nội dung (từ danh sách, từ thông báo
  đẩy hay vào thẳng: Học tập, Chuyên cần, Bài tập, Tiến độ, Học phí, Thông báo, Xin nghỉ; giáo viên: Đơn xin nghỉ) cũng tự đánh dấu đã đọc
  các thông báo liên quan (`MarkNotificationsRead`) và đóng thông báo đẩy cùng trang trên điện thoại.

- Bảng `notifications` do **trigger** sinh tự động (migration `20261022000000_notifications.sql`):
  giáo viên lưu điểm danh (`attendance`) hoặc sổ liên lạc (`daily_reports`) → phụ huynh của bé nhận 1 thông báo.
- Mỗi (phụ huynh, bé, loại, ngày) chỉ có 1 thông báo; giáo viên sửa lại → nội dung cập nhật và hiện lại là _chưa đọc_.
  Lưu lại cả lớp mà trạng thái của bé không đổi thì không gửi thông báo.
- Chuông trên header (chỉ vai trò phụ huynh) hiển thị số chưa đọc, cập nhật qua Supabase Realtime
  (migration đã thêm bảng vào publication `supabase_realtime`). Trang bản tin: `/parent/notifications`.

## Phân tích & báo cáo tiến độ

- **Đánh giá chi tiết**: form sổ liên lạc có thêm 9 tiêu chí (3/môn, chấm 1–5 sao, không bắt buộc) — `SUBJECT_CRITERIA` trong
  `src/config/constants.ts`, lưu trong `daily_reports.subjects_summary.<môn>.criteria` (dữ liệu cũ vẫn đọc được).
- **Trang tiến độ**: phụ huynh `/parent/progress` (tab "Tiến độ"), giáo viên `/teacher/student-analytics` (tab "Phân tích").
  Biểu đồ Recharts: chuyên cần 6 tháng (cột chồng Có mặt / Đi muộn / Nghỉ), tiến bộ từng tiêu chí theo tuần (12 tuần, điện thoại 8 tuần),
  trung bình tháng so với tháng trước; mỗi biểu đồ có "Xem bảng số liệu". Số liệu: `src/features/progress/queries.ts`.
- **Tổng kết tháng**: giáo viên bấm "Tạo bản nháp bằng AI" (gom điểm danh + sổ liên lạc 30 ngày → Claude `claude-opus-5-5`;
  chưa có `ANTHROPIC_API_KEY` → bản nháp theo mẫu từ số liệu thật), xem lại / sửa → "Gửi cho phụ huynh" → phụ huynh nhận thông báo.
  Bảng `monthly_summaries` (migration `20261027000000_monthly_summaries.sql`, file chạy một lần: `supabase/apply-monthly-summaries.sql`).
- **Môn đăng ký**: cột `students.subjects` (migration `20261028000000_student_subjects.sql`, file chạy một lần:
  `supabase/apply-student-subjects.sql`; học sinh cũ mặc định đủ 3 môn). Quản trị viên chọn / sửa ở trang Học sinh;
  trang Tiến độ của phụ huynh chỉ hiện các môn con đã đăng ký (chỉ xem, không thao tác).
- **Xuất PDF**: nút "Xuất PDF" → hộp thoại in của trình duyệt → "Lưu dưới dạng PDF" (CSS in A4, ẩn menu/nút).

## Giao diện phụ huynh

Máy tính / máy tính bảng: **menu dọc bên trái** chia nhóm (Theo dõi con · Trung tâm · Tài khoản) giống khu quản trị. Điện thoại: thanh đáy **Học tập · Lịch học · Bài tập · Nhắn tin · Thêm** (Xin nghỉ học, Tiến độ, Chuyên cần, Học phí, Phản hồi, Thông báo). Các mục: **Học tập** (`/parent/dashboard`) · **Lịch học** (`/parent/schedule`) · **Chuyên cần** (`/parent/attendance`;
`/parent/history` cũ tự chuyển tiếp) · **Tiến độ** (`/parent/progress`) · **Học phí** (`/parent/fees`) · **Phản hồi** (`/parent/feedback`).
Phản hồi lưu ở bảng `feedback` (migration `20261024000000_feedback.sql`, file chạy một lần: `supabase/apply-feedback-migration.sql`);
quản trị viên trả lời tại `/admin/feedback` → phụ huynh nhận thông báo ở chuông (migration `20261025000000_feedback_notifications.sql`,
file chạy một lần: `supabase/apply-feedback-notifications.sql`).

**Gia đình nhiều con:** đổi bé ở chip trên header hoặc chạm thẻ bé dưới lời chào "Xin chào ba mẹ của bé …!" (trang Học tập) — không cần đăng xuất.
Bé đang xem lưu ở cookie `th-edu-child` (server đọc được) + localStorage (dự phòng); thứ tự ưu tiên `?child=` trên URL → cookie → bé đầu tiên
(`src/features/parent/selected-child.ts`, `pickChild`). Server luôn kiểm tra bé thuộc đúng phụ huynh đang đăng nhập, nên cookie/URL giả không xem được bé khác.
Client dùng `useSelectedStudent()` (`SelectedStudentProvider` trong `src/features/parent/components/selected-student.tsx`). Đăng xuất xoá lựa chọn;
đổi bé xoá cache trang ngoại tuyến của service worker.

## Góc Đồng Hành Tại Nhà (bài tập về nhà)

- **Giáo viên** `/teacher/grading`: tab *Giao bài* (tên, hướng dẫn, môn, nộp bằng ảnh/video, hạn nộp) → phụ huynh cả lớp nhận thông báo.
  Tab *Chấm bài*: xem ảnh/video bé nộp, thả tim, tặng 1–3 sao, nhận xét chữ và ghi lời nhắn thoại (MediaRecorder, tối đa 60 giây).
  Tab *Ngôi sao tuần*: bảng xếp hạng "Ngôi sao chăm chỉ" của lớp (Thứ 2 → Chủ nhật).
- **Phụ huynh** `/parent/homework`: danh sách bài với trạng thái Chưa nộp / Đã nộp / Đã được cô chấm; chụp ảnh, quay video hoặc chọn từ thư viện
  rồi nộp (upload resumable, mạng yếu tự tải tiếp). Sửa / nộp lại được tới khi cô chấm. Bảng xếp hạng hiển thị tên gọi của các bé.
- File đính kèm lưu ở bucket PRIVATE `homework` (`{student_id}/{assignment_id}/...`, tối đa 50MB/file).
- Migration `20261029000000_homework.sql` (file chạy một lần: `supabase/apply-homework.sql`).

## Điều hành trung tâm (khu Quản trị)

- **Tổng quan vận hành** `/admin/dashboard`: số học sinh / giáo viên / lớp theo từng cơ sở (CS1 Xa La, CS2 Ngô Thì Nhậm);
  tỷ lệ điểm danh hôm nay (toàn trung tâm + từng cơ sở, kèm chấm công giáo viên); học phí tháng: **đã thu trong tháng**
  (theo nhật ký thu tiền `fee_payments`), còn phải thu, quá hạn, tiến độ kỳ học phí; danh sách **phụ huynh chậm đóng** (gọi điện 1 chạm).
- **Quản lý tài khoản & phân lớp** `/admin/management`:
  - *Giáo viên*: tạo tài khoản, sửa họ tên, **SĐT / email đăng nhập** (cần service role key), cơ sở chính, gán lớp phụ trách hoặc quyền **toàn bộ cơ sở**, xoá.
  - *Học sinh*: thêm mới, sửa thông tin, **chuyển lớp**, liên kết phụ huynh qua **số điện thoại** (để trống = bỏ liên kết).
  - *Học phí*: **Tạo học phí tháng** — chọn tháng, phạm vi (toàn trung tâm / CS1 / CS2), học phí từng lớp (lưu làm mặc định
    `classes.monthly_fee`) → 1 cú click tạo khoản thu cho mọi học sinh và gửi thông báo học phí cho phụ huynh.
    Mỗi bé chỉ 1 khoản / tháng (`fees.period`), bấm lại không tạo trùng.
- **Truyền thông trung tâm** `/admin/announcements`: đăng thông báo chung (Thông báo chung / Lịch nghỉ lễ / Cuộc thi luyện chữ /
  Ngoại khoá — có mẫu soạn sẵn), gửi tới toàn bộ phụ huynh, phụ huynh CS1, CS2 hoặc nhóm lớp cụ thể. Phụ huynh nhận trên chuông
  và xem tại `/parent/announcements` (mục "Thêm" → Thông báo). Xoá thông báo → thông báo trên chuông cũng được gỡ.
- Thông báo có thêm cột `ref_id`: nhiều bài tập / thông báo / khoản thu trong cùng một ngày không còn đè nhau.
- Migration `20261030000000_admin_center.sql` (file chạy một lần: `supabase/apply-admin-center.sql`, chạy **sau** `apply-homework.sql`).

## Tương tác realtime: đơn xin nghỉ, chat, thông báo đẩy

Migration `20261031000000_leave_chat_push.sql` (file chạy một lần: `supabase/apply-leave-chat-push.sql`, chạy **sau** `apply-admin-center.sql`).

- **Đơn xin nghỉ học** — phụ huynh `/parent/leave-request`: chọn ngày (Hôm nay / Ngày mai / khoảng ngày, lùi tối đa 7 ngày), lý do
  (Bị ốm, Việc gia đình, Đi xa, Khác), lời nhắn; huỷ được khi cô chưa xử lý. Giáo viên phụ trách nhận thông báo realtime (chuông + push)
  tại `/teacher/leave-requests` (quản trị: `/admin/leave-requests`) → **Xác nhận / Đồng ý** hoặc Từ chối (kèm lời nhắn), thu hồi được.
  Đồng ý → trigger DB ghi điểm danh `absent_with_permission` (**Nghỉ có phép**) cho mọi ngày học trong đơn (bỏ Chủ nhật) và báo phụ huynh;
  thu hồi → gỡ các dòng điểm danh đó. "Nghỉ có phép" hiện riêng ở thống kê / lịch / biểu đồ và **không tính vào tỷ lệ chuyên cần**.
  **Học phí**: "Tạo học phí tháng" có tuỳ chọn *Trừ học phí các buổi nghỉ có phép tháng trước* — đơn giá/buổi tự tính (học phí lớp ÷ số buổi học
  của tháng, làm tròn 1.000đ) hoặc nhập tay; khoản thu ghi rõ "(đã trừ N buổi nghỉ có phép tháng MM/YYYY)", số buổi được đếm lại ở server.
  Giáo viên cũng chọn tay được trạng thái "Có phép" khi điểm danh.
- **Chat phụ huynh ↔ giáo viên** — `/chat` (tự chuyển tới `/parent/chat` / `/teacher/chat`): tin văn bản, hình ảnh (kho private `chat`),
  emoji, "Đã xem", tin đến tức thì qua Supabase Realtime. Quyền (RLS + hàm `chat_allowed`): phụ huynh chỉ nhắn được với giáo viên phụ trách
  **lớp của con** (lớp chưa có giáo viên riêng → giáo viên phụ trách cả cơ sở); bé chuyển lớp → không nhắn tiếp với giáo viên cũ.
  **Quản trị** `/admin/chat` (menu Điều hành → Nhắn tin PH – GV): xem mọi cuộc trò chuyện (lọc cơ sở / lớp, tìm theo tên – SĐT),
  thống kê số cuộc trò chuyện, tin 7 ngày, **phụ huynh đang chờ cô trả lời**; xem toàn bộ nội dung (realtime) và **gỡ tin không phù hợp**
  (xoá nội dung + ảnh, giữ dấu vết; hai bên thấy "Tin nhắn đã bị quản trị viên gỡ"). Quản trị viên **trả lời trực tiếp** (chữ, ảnh, emoji)
  với tư cách **"Trung tâm TH EDU"** — phụ huynh và giáo viên đều thấy tin (màu tím, nhãn riêng) và nhận thông báo đẩy
  (migration `20261103000000_admin_chat_reply.sql`, file chạy một lần: `supabase/apply-admin-chat-reply.sql`).
  Migration `20261102000000_chat_moderation.sql` (file chạy một lần: `supabase/apply-chat-moderation.sql`).
  **Đã xem = hết hiện**: mở cuộc trò chuyện → đánh dấu đã đọc, huy hiệu "Nhắn tin" trên menu và chấm chưa đọc cập nhật ngay
  (không chờ realtime); quản trị viên mở cuộc trò chuyện / trang Phản hồi / Đơn xin nghỉ → thông báo liên quan trên chuông coi như đã xem.
  Menu hiện **huy hiệu số** realtime: tin chưa đọc (phụ huynh: "Nhắn tin"; giáo viên: "Tin nhắn") và đơn xin nghỉ chờ xác nhận (giáo viên).
- **Web Push** (chuẩn VAPID — Chrome/Android, Edge, Firefox, Safari iPhone iOS 16.4+ sau khi "Thêm vào Màn hình chính"):
  người dùng bật ở trang Bản tin / Tài khoản ("Bật thông báo", "Gửi thử"). Server gửi push ngay sau các thao tác sinh thông báo
  (điểm danh, sổ liên lạc, đơn nghỉ, bài tập, học phí, thông báo chung, tổng kết tháng, trả lời phản hồi) và khi có tin chat.
  Cần `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY` (xem `.env.example`).
  **Tự động cho mọi thông báo** (kể cả sinh ngoài app): chạy `supabase/apply-push-autodispatch.sql` rồi vào `/admin/notifications-settings`
  → "Kết nối tự động" (nhập tên miền HTTPS đã triển khai). Trigger DB dùng pg_net gọi `/api/push/dispatch` (1 lần / câu lệnh, không làm chậm
  giao dịch). Trang này cũng hiện trạng thái VAPID / ZNS, số thiết bị đã bật và nút "Gửi ngay các thông báo đang chờ".
- **Zalo ZNS / SMS (sẵn sàng tích hợp)** — `src/lib/messaging/outbound.ts`: `sendOutbound()` POST JSON chuẩn hoá
  `{ version, channels, to, template, params, idempotencyKey, meta, sentAt }` tới `MESSAGING_WEBHOOK_URL`, ký HMAC-SHA256
  (`X-THEDU-Signature: sha256=…` trên `${timestamp}.${body}`, `X-THEDU-Timestamp`), timeout 5s, thử lại 3 lần; bên nhận dùng
  `verifyOutboundSignature()`. Bật theo loại thông báo bằng `MESSAGING_EVENTS`; `sendOtp(phone, code)` sẵn cho đăng nhập OTP sau này.

## Thông báo hoạt động cho quản trị viên

- **Chuông trên header khu quản trị** (số hoạt động mới kể từ lần xem cuối, cập nhật realtime + thông báo nhỏ góc màn hình, bấm để mở
  đúng trang xử lý) và trang **`/admin/notifications`** (menu Tổng quan → Thông báo hoạt động): lọc Tất cả / Từ phụ huynh / Từ giáo viên /
  theo loại; tab **Chưa xem / Tất cả** — bấm vào thông báo (trên trang hoặc thông báo nhỏ góc màn hình) thì mục đó được đánh dấu đã xem,
  không còn hiện là mới và chuông giảm ngay; có nút "Đánh dấu đã xem tất cả" (mỗi quản trị viên trạng thái riêng —
  file chạy một lần: `supabase/apply-admin-feed-reads.sql`).
- Nguồn (trigger DB, không cần sửa app khác): **phụ huynh** gửi phản hồi, gửi / huỷ đơn xin nghỉ, nộp bài tập, nhắn tin;
  **giáo viên** điểm danh (kèm số có mặt / muộn / vắng / có phép của cả lớp), viết sổ liên lạc, giao / chấm bài tập, đồng ý / từ chối đơn nghỉ,
  gửi tổng kết tháng, nhắn tin. Hoạt động lặp lại trong 30 phút được **gộp** thành 1 dòng (×N) — không ngập thông báo.
- Migration `20261104000000_admin_activity_feed.sql` (file chạy một lần: `supabase/apply-admin-activity-feed.sql`).

## Quản lý & nhắc học phí (tài chính)

Migration `20261106000000_finance.sql` (file chạy một lần: `supabase/apply-finance.sql`).

- **`/admin/finance`** (menu Vận hành → Quản lý tài chính):
  - *Công nợ*: tổng phải thu / đã thu / còn nợ; bảng theo **cơ sở → lớp** (tiến độ thu %, bấm mở danh sách từng học sinh); lọc
    **Đã hoàn thành / Còn nợ / Đóng một phần / Quá hạn**, cơ sở, tháng học phí, tìm theo tên / mã HS / phụ huynh / SĐT; nút "Đã đóng đủ"
    1 chạm; **Xuất Excel (CSV)**.
  - *Hóa đơn hàng loạt*: chọn lớp → tick từng học sinh (mặc định cả lớp) → số tiền + hạn thanh toán (+ tháng học phí: mỗi bé 1 hóa đơn/tháng)
    → tạo bản ghi `fees`, phụ huynh nhận thông báo + push.
  - *Thanh toán & nhắc nợ*: tài khoản nhận học phí (ngân hàng, số TK, chủ TK — có QR xem thử 10.000đ để kiểm tra) và bảng nhắc nợ.
- **VietQR**: `/parent/fees` có nút **"Thanh toán ngay"** cho khoản chưa đóng → mã VietQR động (chuẩn NAPAS/EMVCo, sinh ngay trên máy
  — `src/lib/vietqr.ts`) với đúng số tiền còn thiếu và nội dung `[Mã HS] - [Họ tên không dấu] - [T<tháng> <năm>]`, vd
  `TH00012 - TRAN MINH AN - T11 2026`; sao chép từng trường, lưu ảnh QR. Mã học sinh `students.student_code` (TH00001…) tự cấp.
- **Nhắc học phí tự động** (`send_fee_reminders()` — chạy 8:00 sáng mỗi ngày bằng pg_cron; nút "Gửi nhắc ngay" = Server Action
  `runFeeReminders`; dự phòng cron ngoài `GET /api/cron/fee-reminders` với `Authorization: Bearer <CRON_SECRET>`): thông báo `fee_reminder`
  **trước hạn 3 ngày** và **khi quá hạn** (ngày 1, 8, 15, 22) với lời lẽ nhẹ nhàng; mỗi khoản nhắc 1 lần/ngày; push tự động.
- **Tự động gạch nợ** (tab *Đối soát ngân hàng*, migration `20261107000000_bank_reconcile.sql` → `supabase/apply-bank-reconcile.sql`):
  webhook `POST /api/payments/webhook` nhận biến động số dư từ **SePay** (header `Authorization: Apikey <PAYMENT_WEBHOOK_SECRET>`) hoặc
  **Casso** (header `Secure-Token`) → chỉ xử lý tiền VÀO, mỗi giao dịch đúng 1 lần (`bank_transactions`, unique provider + mã giao dịch) →
  đọc mã học sinh `THxxxxx` + tháng `T<tháng> <năm>` (chịu được nội dung bị viết liền / thêm tiền tố) → ghi nhận ưu tiên khoản đúng tháng,
  rồi khoản nợ cũ nhất; thừa tiền / không đọc được mã → trạng thái *Còn tiền thừa* / *Chưa khớp* + báo admin, gán tay (tìm học sinh) hoặc bỏ qua.
  Phụ huynh nhận thông báo **"Trung tâm đã nhận học phí"** (`fee_paid`) mỗi khi khoản được ghi nhận thêm tiền (tự động hay ghi tay).
  Có **Giả lập giao dịch** để kiểm tra trước khi kết nối ngân hàng.

## Góc Khoảnh Khắc (album hoạt động lớp)

Migration `20261108000000_moments.sql` (file chạy một lần: `supabase/apply-moments.sql`).

- **`/teacher/moments`** (menu Thêm → Khoảnh khắc): chọn lớp → viết lời kể, chọn chủ đề (Hoạt động lớp / Toán tư duy / Luyện chữ /
  Tiền tiểu học / Ngoại khoá) → chọn tối đa 20 ảnh / video (ảnh nén ~2,5MB trên máy, video tải lên có tiếp tục khi rớt mạng) →
  **gắn thẻ học sinh** cho từng ảnh (hoặc "gắn 1 bé cho tất cả ảnh") → Đăng.
  Phạm vi: **Cả lớp** hoặc **Nhóm nhỏ** (chỉ phụ huynh của các bé được gắn thẻ xem được).
- **`/parent/moments`** (menu Thêm / Theo dõi con → Góc khoảnh khắc): bảng tin của lớp con, lọc **Cả lớp / Có bé nhà mình**;
  thả ❤️ / 👍, bình luận (hiện "Bố/mẹ bé …"); chạm ảnh → xem toàn màn hình → **Tải ảnh gốc** chất lượng cao.
- **`/admin/moments`** (menu Đào tạo): xem mọi lớp, đăng bài, xoá bài / bình luận không phù hợp.
- **Thông báo realtime + push**: bài mới → mọi phụ huynh trong lớp (bé được gắn thẻ: "📸 Bé … xuất hiện trong khoảnh khắc mới");
  bình luận mới → giáo viên đăng bài, phụ huynh các bé được gắn thẻ và những người đã bình luận. Bảng tin tự cập nhật khi có bài / bình luận / cảm xúc mới.
- **Riêng tư**: kho `moments` là private, mọi ảnh/video chỉ mở bằng link ký có hạn; RLS `can_view_moment()` — chỉ phụ huynh có con
  học đúng lớp (và với bài nhóm nhỏ: con được gắn thẻ), giáo viên phụ trách lớp và quản trị viên. Xoá bài → xoá luôn tệp và thông báo liên quan.

## Lắng nghe phụ huynh (góp ý & khảo sát hài lòng)

Migration `20261110000000_voice_of_parent.sql` (file chạy một lần: `supabase/apply-voice-of-parent.sql`).

- **`/parent/feedback` — Góp ý & hỗ trợ**: chọn loại (Góp ý / Báo lỗi / Thắc mắc) + chủ đề (Học phí, Chương trình học, Giáo viên,
  Cơ sở vật chất, Ứng dụng, Khác), gửi thẳng Ban Giám đốc (giáo viên không xem được).
  - **Đứng tên**: kèm người liên hệ + SĐT (điền sẵn từ hồ sơ), tuỳ chọn "muốn được gọi lại".
  - **Ẩn danh thật sự**: `feedback.parent_id = NULL`, người gửi lưu ở `feedback_anonymous_owners` — chỉ chính phụ huynh đó đọc được;
    quản trị viên không thấy tên / SĐT / bé, kể cả qua API, bảng thông báo hay thông báo hoạt động. Phụ huynh vẫn nhận trả lời.
- **`/admin/feedback` — Lắng nghe phụ huynh** (tab *Góp ý & hỗ trợ*): thẻ đếm **Chưa xử lý / Đang giải quyết / Đã hoàn tất**,
  lọc loại / chủ đề, tìm theo nội dung / tên / SĐT, nhắc số phụ huynh chờ gọi lại. Nút *Tiếp nhận*, *Trả lời & hoàn tất*,
  *Trả lời, vẫn đang giải quyết*, *Hoàn tất*, *Mở lại* — mỗi lần trả lời / đổi trạng thái, phụ huynh nhận thông báo trong app + push.
- **Khảo sát hài lòng hàng tháng**: popup tự hiện cho phụ huynh từ ngày 24 tới hết tháng (sau 5 giây, không chen vào trang Nhắn tin):
  1–5 sao chung + từng môn con đang học (Tiền tiểu học, Luyện chữ đẹp, Toán tư duy) + nhận xét ngắn. "Để sau" → hỏi lại sau 2 ngày;
  "Không hỏi lại tháng này" → lưu vào DB. Chấm ≤ 2 sao → báo ngay cho quản trị viên. Tab *Khảo sát hài lòng*: điểm trung bình,
  CSAT (% 4–5★), tỉ lệ phản hồi, phân bố sao, điểm từng môn, theo cơ sở, xu hướng 6 tháng, nhận xét (điểm thấp lên trước).
  Đổi ngày mở đợt: `SURVEY_OPEN_DAY` trong `src/features/surveys/constants.ts`.

## Bảo mật & nhật ký hoạt động

Migration `20261109000000_security_audit.sql` (file chạy một lần: `supabase/apply-security-audit.sql`).

- **RLS**: mọi bảng nghiệp vụ lọc theo quyền ngay trong database — phụ huynh chỉ đọc dữ liệu của con mình (`students.parent_id = auth.uid()`
  qua `is_parent_of()`), giáo viên chỉ lớp được phân công (`teacher_can_access_student()`), quản trị viên toàn quyền. Migration bổ sung:
  khách chưa đăng nhập (`anon`) không có quyền gì trên bảng / hàm; bảng nào quên bật RLS sẽ tự bật; hàm nội bộ không gọi trực tiếp được;
  chỉ quản trị viên được đổi phụ huynh / cơ sở / lớp của học sinh và SĐT tài khoản.
- **Kiểm tra cách ly**: chạy `supabase/tests/rls-isolation.sql` trong SQL Editor (chỉ đọc) — đóng vai từng phụ huynh / giáo viên thật,
  đếm số dòng đọc được ngoài phạm vi; mọi dòng phải là **PASS**. `/admin/audit-logs` → *Kiểm tra bảo mật*: tự rà cấu hình (RLS, quyền anon,
  hàm SECURITY DEFINER, policy mở, bucket công khai).
- **Nhật ký hoạt động** (`/admin/audit-logs`, menu Hệ thống): trigger `audit_row_change` tự ghi mọi thao tác tạo / sửa / xoá của giáo viên,
  quản trị viên và hệ thống trên điểm danh, sổ liên lạc, học phí, học sinh, tài khoản, phân công, chấm bài, đơn xin nghỉ, tổng kết tháng,
  chấm công, giao dịch ngân hàng… (ai, lúc nào, bản ghi nào, trường nào đổi từ gì sang gì). Lưu lại cùng giá trị (vd. lưu lại điểm danh cả lớp)
  không tạo dòng thừa. Lọc theo loại dữ liệu, thao tác, người thao tác, khoảng ngày, học sinh. Chỉ quản trị viên xem; không ai sửa / xoá được.
- **Validation**: mọi Server Action và API route kiểm tra đầu vào bằng Zod (id phải là UUID, payload webhook SePay / Casso đúng định dạng,
  body tối đa 256KB).
- **Rate limiting** (`src/lib/security/rate-limit.ts`): đăng nhập sai 5 lần / tài khoản hoặc 30 lần / IP trong 15 phút → tạm khoá 15 phút
  (kể cả khi sau đó nhập đúng); đổi mật khẩu 5 lần / 15 phút; webhook / cron gửi sai secret 10 lần → khoá IP; giới hạn tin nhắn, bình luận,
  phản hồi, đơn xin nghỉ, trợ lý ảo. Kho đếm: Upstash Redis nếu có `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, ngược lại bảng
  `rate_limits` trên Supabase (dùng chung giữa các instance).

## Nút liên hệ góc dưới phải

Trang đăng nhập (`/login`, `/login/parent`, `/login/teacher`) và khu phụ huynh có 2 nút nổi
(`src/features/parent-chat/components/floating-contact.tsx`):
- **Chat với tư vấn viên** — ưu tiên trả lời tự động: trợ lý AI nếu có `ANTHROPIC_API_KEY`, ngược lại câu trả lời soạn sẵn
  theo từ khoá (`src/features/parent-chat/faq.ts`). Khách chưa đăng nhập dùng `POST /api/consult-chat` (không truy cập dữ liệu
  học sinh, giới hạn theo IP); phụ huynh đã đăng nhập dùng `/api/parent-chat` (theo dữ liệu của con). Đầu khung chat luôn có nút Zalo + hotline.
- **Chat Zalo** — mở `https://zalo.me/<hotline>` (đổi trong `ORGANIZATION` ở `src/config/constants.ts`).

## Trợ lý ảo cho phụ huynh (chatbot)

- Nút "Hỏi trợ lý" ở mọi trang phụ huynh; API `POST /api/parent-chat` (stream text) gọi Claude (`claude-opus-5-5`).
- Câu trả lời dựa trên dữ liệu thật của con do server lấy theo quyền RLS: điểm danh 30 ngày, sổ liên lạc 14 ngày,
  học phí (`src/features/parent-chat/context.ts`). Kiến thức chung + quy tắc trả lời: `prompt.ts`.
- Cần `ANTHROPIC_API_KEY` (server). Không có khoá → nút trợ lý tự ẩn.
- Giới hạn 20 câu hỏi / 10 phút / phụ huynh (bộ nhớ trong tiến trình — nhiều instance thì chuyển sang Redis).
- Dữ liệu gửi tới Anthropic: tên gọi, lớp, tuổi, điểm danh, nhận xét, học phí của con (không gửi SĐT, ngày sinh, ảnh).

## Hiệu năng & tối ưu

- **Ảnh tải lên** (`src/lib/images/compress.ts`, thư viện `browser-image-compression` chạy trong Web Worker): nén **< 400KB**: giữ chất lượng
  JPEG cao (≥ 0.72) và hạ dần cạnh dài 2048 → 1280px (chất lượng thấp làm nhoè nét chữ viết tay; giảm độ phân giải thì không), **bỏ EXIF/GPS**;
  áp dụng cho sổ liên lạc, bài tập về nhà, ảnh chat. Riêng Góc khoảnh khắc giữ ≤ 2,5MB / 3200px để phụ huynh tải ảnh gốc chất lượng cao.
- **Hiển thị ảnh**: `MediaImage` (`src/components/shared/media-image.tsx`) bọc `next/image` — lazy loading, placeholder mờ, `sizes` theo ô hiển thị;
  ảnh Supabase qua bộ tối ưu Next (AVIF/WebP đúng kích thước), ảnh xem trước (blob:) hiển thị thẳng. Logo / ảnh nền dùng bản tạo sẵn nhẹ.
- **Truy vấn**: không còn `select("*")` — mọi truy vấn chỉ lấy đúng cột cần dùng (cột từ migration tuỳ chọn có đường dự phòng).
- **Cache**: `React.cache` gộp truy vấn lặp trong 1 lượt render (danh sách học sinh, phiên đăng nhập); `unstable_cache` + `revalidateTag`
  cho danh sách con và lịch sử điểm danh của phụ huynh (`src/features/parent/cached.ts`, tag ở `src/lib/cache-tags.ts`) — làm mới ngay khi
  điểm danh, duyệt đơn nghỉ, thêm/sửa/chuyển lớp học sinh; `experimental.staleTimes` giữ trang 30s khi chuyển tab qua lại.
- **JS tải về điện thoại** (gzip, gồm cả layout): trang phụ huynh ~**136–149kB** (trước đây 203–231kB; trang Tiến độ 324kB → 142kB).
  Supabase phía trình duyệt (~68kB) không còn trong lần tải đầu — `src/lib/supabase/lazy-client.ts`: realtime (chuông, huy hiệu tin nhắn,
  bảng tin…) đăng ký khi trình duyệt rảnh sau khi vẽ trang (`useIdleRealtime`), tải ảnh / tải file gốc nạp client khi bấm (`getBrowserClient`);
  thư viện upload resumable (tus) và recharts (biểu đồ Tiến độ, khung chiều cao cố định) cũng nạp khi cần.
- **Skeleton không nhảy bố cục** (`src/components/shared/parent-skeletons.tsx`): dựng đúng khung, padding, line-height của Card điểm danh,
  bảng học phí, gallery khoảnh khắc, bài tập, nhắn tin — đã đo bằng Chrome: các khối trên màn hình đầu lệch 0px so với trang thật.
  Vùng nội dung luôn cao ≥ màn hình nên footer không bị đẩy trong tầm nhìn.
- **CSS**: khung chat tư vấn chỉ tải khi bấm mở; CSS nhúng thẳng vào HTML (`experimental.inlineCss`); metadata luôn trong `<head>`.
- Lighthouse (điện thoại giả lập, trang đăng nhập): Performance 90–92 · Accessibility 100 · Best Practices 100. SEO bị trừ do `noindex`
  — cố ý, không cho công cụ tìm kiếm lập chỉ mục app chứa dữ liệu trẻ em. (Lighthouse 12 đã bỏ hạng mục PWA; kiểm tra cài đặt bằng
  DevTools → Application: không lỗi installability.)

## Giao diện kiểu app (App Shell)

Dùng chung cho cả 3 khu Phụ huynh / Giáo viên / Quản trị:

- **Thanh tab đáy** (`src/components/shared/bottom-tab-nav.tsx`): cố định đáy, chừa vùng an toàn (thanh cử chỉ Android, iPhone),
  tab đang mở nổi bật (biểu tượng phóng nhẹ + nền & chữ màu thương hiệu), huy hiệu số chưa đọc; mục phụ gom vào "Thêm" / "Menu"
  (Bottom Sheet chia nhóm).
  - Phụ huynh: **Hôm nay · Khoảnh khắc · Học tập · Học phí · Cá nhân** — huy hiệu = thông báo chưa đọc của nhóm
    (`PARENT_TAB_NOTIFICATIONS`), giảm ngay khi mở trang liên quan. Tab Học tập có thanh mục con
    Tiến độ · Bài tập · Chuyên cần · Lịch học; trang **Cá nhân** (`/parent/me`) gom Nhắn tin, Xin nghỉ, Góp ý, Thông báo, Đổi mật khẩu.
  - Giáo viên: Tổng quan · Điểm danh · Sổ liên lạc · Tin nhắn · Thêm. Quản trị: Tổng quan · Hoạt động · Tin nhắn · Tài chính · Menu.
- **Header thông minh** (`scroll-header.tsx`): cuộn xuống → trượt ẩn (điện thoại), cuộn lên → hiện lại; chỉ dùng transform nên không
  xô lệch nội dung. Phụ huynh: **chip của bé** (avatar · lớp · CS1 Xa La / CS2 Ngô Thì Nhậm) — nhiều con thì chạm để đổi bé, giữ nguyên
  trang đang xem. Avatar tài khoản → Bottom Sheet (trang cá nhân, đổi mật khẩu, đăng xuất).
- **Bottom Sheet** (`src/components/ui/sheet.tsx`, Radix Dialog): trượt từ dưới lên, vuốt xuống để đóng, khoá cuộn nền, Esc, khoá focus;
  máy tính hiển thị hộp thoại giữa màn hình. **Không còn `window.confirm`**: mọi xác nhận dùng
  `await confirmSheet({ title, description, confirmLabel, tone: "danger" })` (`confirm-sheet.tsx`) — thao tác xoá/gỡ có nút đỏ và
  focus sẵn nút Huỷ. Thanh toán VietQR, khảo sát hài lòng, chọn bé, menu "Thêm" cũng là Bottom Sheet.

## Design System TH EDU

Xem trực quan: **`/admin/design-system`** (menu Hệ thống) — dựng thẳng từ token nên luôn khớp code.

> **Sau khi sửa `tailwind.config.ts`** (màu, cỡ chữ, bóng đổ): tắt `npm run dev`, xoá thư mục `.next-dev` rồi chạy lại. Server dev giữ
> cấu hình Tailwind cũ trong bộ nhớ đệm → màu mới (vd. `bg-edu-navy`) không được tạo, chữ trắng trên header / thẻ thương hiệu mất nền và
> "biến mất". Bản build production (`npm run build`) không bị ảnh hưởng.

- **Màu** (`src/app/globals.css` + `colors.edu` trong `tailwind.config.ts`): Edu Blue `#1E4FB0` (màu chủ đạo — uy tín, tri thức),
  điểm nhấn **xanh lá non** `edu-leaf` (phát triển — Tiền tiểu học) và **cam pastel** `edu-peach` (năng động — Toán tư duy), header quản trị
  `edu-navy`; nền `#F8FAFC`, thẻ trắng. Mọi cặp chữ / nền đã kiểm tương phản WCAG (≥ 6:1, chữ trắng trên nút 7.5:1).
- **Trạng thái** (`src/config/ui-styles.ts`): có mặt = xanh lá pastel, vắng = đỏ hồng ấm, đi muộn = vàng nghệ, nghỉ có phép = xanh trời —
  chữ đậm trên nền pastel (≥ 6:1), không dùng chữ trắng trên nền màu.
- **Chữ**: Plus Jakarta Sans (có tiếng Việt, 400–800). Thang chữ (`fontSize` trong `tailwind.config.ts`): xs 14 · sm 15 · base 16 · xl 20 ·
  2xl 24 — **nhỏ nhất 14px** (chỉ số trên huy hiệu tròn nhỏ hơn). Tên bé 24px ExtraBold, tiêu đề trang 20px, nhận xét của cô 16px Medium,
  ngày tháng 14px SemiBold.
- **Thẻ**: `rounded-2xl`, `shadow-sm` / `shadow-md` (bóng mềm ánh xanh), viền `ring-border`; điểm nhấn `shadow-neu` (ô số liệu, điểm danh),
  kính mờ cho header / thanh tab, thẻ thương hiệu gradient Edu Blue.
- Skeleton dựng dòng theo kiểu chữ (`Line text="text-xs"`) → tự khớp khi đổi thang chữ (đã đo lại: lệch 0px trên màn hình đầu).

## Hiệu ứng & trạng thái chờ

- **Skeleton + shimmer**: mọi khung chờ dùng `Skeleton` (`src/components/ui/skeleton.tsx`) có vệt sáng chạy ngang (pseudo-element,
  transform — mượt trên máy yếu). Skeleton phụ huynh (`parent-skeletons.tsx`) dựng đúng khung trang thật — đã đo bằng Chrome, lệch 0px
  ở trang Hôm nay (thẻ học sinh, Card điểm danh, Nhật ký bài học, Gallery ảnh), Chuyên cần, Học phí, Khoảnh khắc, Bài tập.
- **Chuyển trang**: `template.tsx` của 3 khu → hiện dần + trượt nhẹ (~240ms, chỉ opacity/transform → không xô lệch bố cục).
- **Phản hồi khi bấm**: mọi `<Button>` thu nhỏ nhẹ khi nhấn; thẻ / chip / dòng menu dùng class `tap`; thả tim ❤️ (khoảnh khắc, cô chấm bài)
  → tim "bật" + vòng sáng; nút "Nộp bài" và thẻ bài tập nảy lên khi nộp (`playAnimation` trong `src/lib/motion.ts`).
- **Toast** (`src/components/ui/toast.tsx`, `toast.success/error`): góc trên màn hình, icon động (dấu tick tự vẽ, dấu lỗi rung), âm báo
  nhẹ (Web Audio) + rung (Android), vuốt lên để tắt. Tự hiện cho mọi form dùng `useFormAction`, và cho: lưu điểm danh, sổ liên lạc, chấm bài,
  duyệt đơn nghỉ, gửi / huỷ đơn xin nghỉ, nộp bài, chấm công, trả lời góp ý. Tắt âm báo: avatar → "Âm báo khi thao tác".
- **Trang lỗi** (`error-fallback.tsx`): lời lẽ dễ hiểu, phân biệt mất mạng / có phiên bản mới / lỗi tải; "Thử lại" tải lại dữ liệu
  (`router.refresh` + `reset`), mất mạng thì tự thử lại khi có mạng; mã lỗi kỹ thuật thu gọn trong "Thông tin cho bộ phận hỗ trợ".
- Máy bật **Giảm chuyển động** → tắt mọi hiệu ứng (`globals.css`).

## Tuyển sinh & học thử (CRM)

Chạy `supabase/apply-admissions.sql` trong Supabase SQL Editor (sau `apply-voice-of-parent.sql`).

- **/admin/admissions**: danh sách học sinh tiềm năng (bảng `leads`) dạng Kanban (kéo thả trên máy tính) hoặc Bảng. Trạng thái: Mới → Đã liên hệ → Hẹn học thử → Đã nhập học / Không theo học. Có lọc theo cơ sở, chương trình, tìm theo tên hoặc SĐT, nhắc hẹn gọi lại và tỷ lệ chốt.
- **/admin/admissions/trials**: xếp lịch học thử (bảng `trial_classes`).
  - Tin xác nhận gửi tự động qua webhook Zalo ZNS / SMS (template `trial_booked`, xem `MESSAGING_WEBHOOK_URL`). Chưa kết nối thì sao chép tin, mở SMS hoặc Zalo rồi bấm "Đã báo phụ huynh".
  - Giáo viên được phân công nhận thông báo "Lịch học thử".
- **/teacher/trials**: giáo viên đánh giá nhanh sau buổi học (mức năng lực, sao từng kỹ năng, điểm mạnh, đề xuất). Đánh giá đi qua RPC nên giáo viên không thấy SĐT hay ghi chú tư vấn. Tư vấn viên nhận tin ở bảng tin quản trị (mục Tuyển sinh).
- **Chuyển thành học viên chính thức**: tạo hoặc dùng lại tài khoản phụ huynh theo SĐT, rồi `convert_lead_to_student()` tạo học sinh, khoản học phí đầu tiên và đánh dấu lead "Đã nhập học" trong một giao dịch. Nếu lỗi, tài khoản vừa tạo được xoá lại.
- Chỉ quản trị viên (Quản lý / Tư vấn viên dùng tài khoản quản trị) truy cập 2 bảng, theo RLS. Mọi thay đổi được ghi vào `audit_logs`.

## Lịch dạy, chấm công theo ca & lương giáo viên

Chạy `supabase/apply-teaching-payroll.sql` trong Supabase SQL Editor.

- **/teacher/schedule**: lịch tuần / tháng của giáo viên, lấy từ ca học của lớp + phân công lớp. Bấm vào một ca để xem môn, phòng, cơ sở và danh sách học sinh.
  - Thẻ "Ca dạy hôm nay" có nút **Bắt đầu ca dạy / Kết thúc ca dạy**. Giờ được ghi theo máy chủ, cơ sở lấy theo lớp.
  - Không mở được 2 ca cùng lúc. Bắt đầu ngoài giờ ca thì phải ghi lý do (dạy bù / dạy thay).
  - Khi bắt đầu ca, hệ thống tự chấm "Có mặt / Đi muộn" ở Chấm công giáo viên.
- **/admin/payroll**: lương tháng = Σ ca hợp lệ × đơn giá buổi theo môn.
  - Đơn giá được chốt khi kết thúc ca.
  - Xem / sửa / huỷ từng ca, thêm ca giáo viên quên bấm.
  - Xuất **Excel (.xlsx, 3 sheet)** hoặc **CSV**.
- **/admin/payroll/settings**: đơn giá / buổi theo môn (mặc định + riêng từng giáo viên), môn dạy chính và phòng học của từng lớp.

## Giám sát vận hành & phòng chống sự cố

Chạy `supabase/apply-monitoring.sql`. Chi tiết sao lưu, khôi phục và giám sát: [docs/backup-disaster-recovery.md](docs/backup-disaster-recovery.md).

- **Trang lỗi**: `error.tsx` riêng cho `/parent`, `/teacher`, `/admin`. Khi trang lỗi, menu của khu vẫn hiện; lỗi tự được báo cho kỹ thuật viên; mất mạng thì trang tự thử lại khi có mạng.
- **Nhật ký lỗi**: ghi lỗi client và server (render, Server Action, truy vấn Supabase, upload ảnh, mất mạng) vào bảng `error_events`.
  - Gửi thêm sang Sentry nếu đặt `SENTRY_DSN`.
  - Xem ở Admin → **Giám sát hệ thống**.
  - Code chính: `src/instrumentation.ts`, `src/lib/monitoring/*`.
- **`/api/health`**: kiểm tra Database, Auth và Storage; trả 200 hoặc 503 — trỏ UptimeRobot / Better Stack vào đây.
- **Sao lưu**: `.github/workflows/db-backup.yml` chạy pg_dump hằng ngày, có mã hoá. Sao lưu thủ công: `scripts/backup-db.ps1`.
- **Toàn vẹn dữ liệu**:
  - tạo index cho mọi khoá ngoại;
  - tự xoá thông báo khi bản ghi gốc bị xoá;
  - báo cáo bản ghi / file mồ côi, có nút dọn file trong Storage.

## Hiệu năng database

Chạy `supabase/apply-performance.sql`. Chi tiết: [docs/performance.md](docs/performance.md).

- Đã có index cho các truy vấn nóng; file trên chỉ bổ sung index còn thiếu:
  - `fees (student_id, status, due_date)`
  - `teaching_sessions (teacher_id, date)`
  - `profiles (phone)`
- Policy RLS tính vai trò 1 lần cho mỗi câu lệnh, không tính lại ở từng dòng.
- Đo trên dữ liệu thật: `supabase/tests/performance-check.sql` (chỉ đọc).
- Không dùng `select("*")`. App gọi Supabase qua HTTP nên không cần connection pool riêng.
- Realtime tự ngắt khi app bị ẩn quá 60 giây.

## Kiểm thử

Chi tiết: [tests/README.md](tests/README.md).

- `npm test`: unit test Jest cho học phí, đối soát chuyển khoản, lương, ngày tháng và form sổ liên lạc. Không cần Supabase.
- `npm run test:e2e`: E2E Playwright.
  - Kiểm tra chặn trang khi chưa đăng nhập, trang đăng nhập và `/api/health`.
  - Đăng nhập phụ huynh và giáo viên.
  - Giáo viên điểm danh, phụ huynh thấy đúng trạng thái. Kịch bản này ghi dữ liệu nên cần tài khoản test trong `.env.e2e` và `E2E_ALLOW_WRITES=1`.
- CI: `.github/workflows/test.yml`.

## Triển khai & bảo mật Production

Chi tiết: [docs/deployment.md](docs/deployment.md) (CI/CD, Vercel, tên miền `app.thedu.edu.vn` + SSL, checklist).

- **Biến môi trường**: mẫu tách rõ biến công khai và biến chỉ server ở [.env.production.example](.env.production.example).
  - `npm run build` tự kiểm tra trước và sau build (`scripts/check-env.mjs`).
  - Build dừng nếu khoá bí mật có thể lộ xuống trình duyệt.
- **Header bảo mật**:
  - CSP theo nonce, gắn trong `src/middleware.ts` + `src/lib/security/csp.ts`;
  - HSTS, X-Frame-Options, nosniff, COOP, Referrer-Policy, Permissions-Policy, khai báo ở `next.config.ts`;
  - vi phạm CSP được báo về `/api/csp-report`.
- **Lint**: `npm run lint` (ESLint CLI, 0 cảnh báo); kiểm tra kiểu: `npm run typecheck`.

## Cơ sở, bản đồ & đưa đón

Chạy `supabase/apply-campuses.sql`. Dữ liệu mặc định ở [src/config/campuses.ts](src/config/campuses.ts).

- **Phụ huynh**:
  - Widget **Đưa đón con hôm nay** trên trang Hôm nay: cơ sở bé học, giờ vào lớp / tan học, chỉ đường và gọi cô 1 chạm.
  - Trang **/parent/campuses**: bản đồ 2 cơ sở với marker TH EDU. Chạm marker để xem ảnh mặt tiền, hotline, giờ mở cửa, lớp của bé.
  - **Cơ sở nào gần nhà tôi?** (định vị chỉ xử lý trên máy).
  - Đơn **xin chuyển cơ sở**.
- **Chỉ đường**:
  - Google Maps / Apple Maps (iPhone), xuất phát từ vị trí hiện tại.
  - Chưa xác minh toạ độ thì chỉ đường theo địa chỉ chữ.
- **Quản trị viên** (**/admin/campuses**):
  - dán link Google Maps để tự lấy toạ độ chính xác; sửa hotline, giờ mở cửa; tải ảnh mặt tiền;
  - duyệt đơn chuyển cơ sở và xếp lớp mới; phụ huynh nhận thông báo.
- **Hiệu năng**:
  - Leaflet chỉ nạp khi bản đồ sắp hiện; trang Hôm nay không tải bản đồ.
  - Ảnh nền OpenStreetMap, tự chuyển sang Esri khi mạng chặn.
  - Dùng nhà cung cấp riêng: `NEXT_PUBLIC_MAP_TILE_URL`.

## Phân tích vận hành (Ban Giám đốc)

Chạy `supabase/apply-analytics.sql`. Trang **/admin/analytics**:

- **KPI**: sĩ số, học sinh có đi học & tăng trưởng, tỷ lệ giữ chân, học thử → nhập học, chuyên cần, thực thu, công nợ.
- **So sánh CS1 / CS2**.
- **Đăng ký & lấp đầy theo môn**: cần đặt sĩ số tối đa của lớp tại Lương giáo viên → Đơn giá & lớp.
- **Biểu đồ** (có bảng số liệu):
  - doanh thu thực thu vs còn thiếu;
  - tăng trưởng học sinh;
  - chuyên cần theo tuần từng cơ sở;
  - số buổi nghỉ;
  - xu hướng quan tâm môn học.
- **Lớp cần chú ý**: nghỉ không phép ≥ 15% hoặc tăng ≥ 5 điểm %.
- **Xuất báo cáo**: Excel (7 sheet) và PDF (hộp thoại in).
- **Báo cáo tự động** tối Chủ nhật (`vercel.json` cron): gửi vào Bảng tin quản trị, kèm email nếu cấu hình Resend.
- **Hiệu năng**:
  - mọi phép tổng hợp chạy trong 1 hàm SQL `analytics_report()` (GROUP BY / FILTER), chỉ trả về vài trăm con số;
  - kết quả dùng chung trong 10 phút (`unstable_cache`, tag `analytics`);
  - biểu đồ (recharts) tải sau khi trang đã hiển thị.

## PWA (Thêm vào Màn hình chính)

- **Offline**: service worker (`public/sw.js`) lưu các trang phụ huynh / giáo viên đã mở (mạng trước, mất mạng → bản đã lưu) và ảnh đã xem;
  trang offline liệt kê các trang đã lưu để mở lại. Dữ liệu lưu **bị xoá khi đăng xuất** (mở trang đăng nhập).
- **Nhắc cài đặt PWA** (`InstallPrompt` + hook `usePWAInstall()` trong `src/lib/pwa/`): banner nhỏ ở góc dưới (trên thanh tab)
  "Cài đặt TH EDU Companion ra màn hình chính…" với [Cài đặt ngay] / [Bỏ qua].
  - **Chrome / Edge Android**: [Cài đặt ngay] mở thẳng hộp thoại cài của trình duyệt (`beforeinstallprompt`, được bắt sớm bằng script có nonce
    trong `<head>` → không lỡ sự kiện bắn trước khi React chạy). Trình duyệt không hỗ trợ → hướng dẫn ⋮ → "Cài đặt ứng dụng".
  - **Safari iPhone / iPad**: hướng dẫn 2 bước có hình minh hoạ (Chia sẻ → "Thêm vào MH chính"), nút "Tôi đã thêm xong".
  - **Mở trong Zalo / Facebook / Messenger…** (không cài được): hướng dẫn "••• → Mở bằng trình duyệt".
  - **Không làm phiền**: chỉ trên điện thoại chưa cài, từ lần mở thứ 2, sau ~8 giây; không hiện ở trang nhắn tin;
    [Bỏ qua] → im 7 ngày → 21 ngày → thôi hẳn. Cài xong (`appinstalled`) hoặc mở từ màn hình chính → tự ẩn vĩnh viễn.
- Manifest có lối tắt (nhấn giữ biểu tượng): Bản tin, Nhắn tin với cô, Xin nghỉ học.
- **Mở app tức thì** (service worker v7, `StalePageRefresh`): trang phụ huynh / giáo viên đã từng mở hiện ngay bản lưu trên máy (~30ms thay vì
  chờ mạng), kèm thông báo nổi "Đang cập nhật dữ liệu mới nhất…" và tự thay bằng dữ liệu mới sau vài giây. Không dùng bản lưu quá 3 ngày;
  mở lại cùng trang trong 15 giây → đi mạng (tránh vòng lặp khi vừa cập nhật phiên bản); mất mạng → "Đang ngoại tuyến · xem bản lưu lúc …".
- **App shell cache-first**: JS/CSS/font build, icon, logo TH EDU (cả bản tối ưu qua `/_next/image`), manifest được lưu
  sẵn trên máy → mở lại app từ màn hình chính không phải tải lại các tài nguyên này. **Navigation Preload**: trang được tải song song lúc
  service worker khởi động. Lần mở đầu tiên sau mỗi bản cập nhật sẽ tải tài nguyên mới (đổi `VERSION` trong `sw.js` khi đổi chiến lược cache).

## Upload ảnh/video

Ảnh được nén trên trình duyệt; mọi file tải lên Supabase Storage bằng giao thức resumable (TUS, chunk 6MB):
có % tiến trình, tự thử lại khi mạng chập chờn, tải _tiếp_ (không tải lại từ đầu) khi có mạng trở lại.

## Góc Thành tích (Sao & Huy hiệu)

Chạy `supabase/apply-achievements.sql` (cần đã chạy apply-homework).

- **Giáo viên** (**/teacher/achievements**, quản trị: **/admin/achievements**):
  - chọn lớp + ngày, chạm 1–3 sao cho từng bé (chạm lại để bỏ), "+ Huy hiệu" để trao huy hiệu vinh danh;
  - nút tặng nhanh 1 ⭐ cho các bé có mặt chưa có sao;
  - mục **Quà cần trao**: bé đủ sao của mốc quà → bấm "Đã trao quà" sau khi trao ở lớp;
  - chỉ tặng / sửa cho bé lớp mình phụ trách, trong 7 ngày gần nhất (RLS `can_award_student`).
- **Phụ huynh** (**/parent/achievements**, thêm thẻ tóm tắt trên trang Hôm nay):
  - tổng sao tích luỹ (sao buổi học + sao bài tập) và thanh tiến độ tới phần quà kế tiếp;
  - bộ sưu tập huy hiệu theo tháng, bảng vàng của lớp (chỉ hiện tên gọi các bạn), nhật ký thành tích;
  - huy hiệu mới / đạt mốc quà mới → **pháo giấy** + lời chúc mừng (1 lần; ghi nhớ ở localStorage; tắt khi máy bật "Giảm chuyển động").
- **Thông báo**: gộp 1 thông báo / bé / ngày (`achievement`); có huy hiệu mới thì thông báo hiện lại "chưa đọc" và gửi push.
- **Quản trị viên** (**/admin/achievements/settings**): thêm / sửa / ẩn huy hiệu và mốc quà. Không xoá được, để giữ bộ sưu tập của bé.

## Lịch hẹn trao đổi phụ huynh – giáo viên – Ban quản lý (Office Hours)

Chạy `supabase/apply-consultations.sql`. Database đã chạy bản cũ (chỉ giáo viên ↔ phụ huynh) được tự nâng cấp, dữ liệu giữ nguyên.

Mỗi lịch hẹn có **người chủ trì** (giáo viên hoặc quản trị viên) và **khách** (phụ huynh hoặc giáo viên):
phụ huynh → cô chủ nhiệm, phụ huynh → Ban quản lý, giáo viên → Ban quản lý.

- **Quản trị viên** (**/admin/consultations**, menu "Lịch hẹn trao đổi"):
  - xem **mọi lịch hẹn** (lọc theo ngày, trạng thái, người chủ trì), có thống kê: chờ xác nhận, sắp tới 7 ngày, đã diễn ra tháng này, huỷ / không nhận;
  - **xác nhận / không nhận / huỷ thay giáo viên**;
  - **Lên lịch hẹn** trực tiếp, xác nhận ngay, không cần khung giờ:
    - Tôi ↔ Phụ huynh;
    - Tôi ↔ Giáo viên;
    - Giáo viên ↔ Phụ huynh (sắp xếp buổi trao đổi);
    - báo lỗi nếu ai đó đã có lịch trùng giờ;
  - tab **Khung giờ rảnh**:
    - mở khung giờ của Ban quản lý, chọn dành cho phụ huynh / giáo viên / cả hai;
    - tạm dừng / xoá khung giờ của giáo viên;
  - lịch mới / huỷ lịch hiện trong **Thông báo hoạt động** (loại "Lịch hẹn"); lịch với chính mình có push + nhắc trước 30 phút.
- **Giáo viên** (**/teacher/availability**):
  - mở **khung giờ rảnh hằng tuần** (vd. Thứ 7 16:00–17:30), chọn độ dài mỗi ô (15–60 phút) và hình thức: trực tuyến (link họp cố định), tại trung tâm (địa điểm), gọi điện;
  - nhận thông báo khi có lịch mới → **Xác nhận lịch hẹn** (kèm lời nhắn, link họp) hoặc **Không nhận** (bắt buộc ghi lý do);
  - **đặt lịch với Ban quản lý** khi Ban quản lý mở khung giờ cho giáo viên.
- **Phụ huynh** (**/parent/booking**, mục Cá nhân):
  - chọn cô chủ nhiệm hoặc Ban quản lý, chọn ngày, chọn ô trống trong 3 tuần tới, ghi nội dung (có gợi ý sẵn);
  - ô đã có người đặt hiện "Đã có lịch" (không lộ ai đặt);
  - lịch đã xác nhận: đếm ngược, nút **Vào phòng họp**, **Thêm vào lịch** (file .ics, nhắc trước 30 phút), huỷ lịch.
- **Quy tắc** (kiểm tra trong database, RPC `book_consultation` / `admin_schedule_consultation` / `decide_consultation` / `cancel_consultation`):
  - khách đặt trước ít nhất 2 giờ, trong 30 ngày tới; tối đa 2 lịch sắp tới với 1 người chủ trì;
  - 1 ô chỉ 1 lịch (chỉ số duy nhất); phụ huynh chỉ đặt với cô chủ nhiệm của bé và Ban quản lý; giáo viên chỉ đặt với Ban quản lý;
  - quản trị viên lên lịch trong 90 ngày tới, 10–180 phút, không trùng giờ với lịch khác của 2 bên.
- **Nhắc lịch tự động trước 30 phút** cho cả hai bên: `send_consultation_reminders()` chạy mỗi 5 phút bằng pg_cron.
  - Không bật được pg_cron → cho cron ngoài (vd. cron-job.org) gọi `GET /api/cron/consultation-reminders` mỗi 5 phút, header `Authorization: Bearer <CRON_SECRET>`.
  - Không thêm vào `vercel.json`, vì Vercel gói Hobby chỉ cho cron mỗi ngày 1 lần.
