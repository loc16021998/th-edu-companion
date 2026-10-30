# Sao lưu, khôi phục & giám sát vận hành — TH EDU Companion

Tài liệu cho người vận hành kỹ thuật của trung tâm. Mục tiêu:

| Chỉ số | Mục tiêu | Đạt được nhờ |
|---|---|---|
| **RPO** — mất tối đa bao nhiêu dữ liệu | ≤ 2 phút (có PITR) · ≤ 24 giờ (không PITR) | Supabase PITR / bản sao lưu hằng ngày |
| **RTO** — bao lâu thì chạy lại | ≤ 1 giờ | Khôi phục từ Supabase Dashboard hoặc từ bản dump |
| Phát hiện sự cố | ≤ 5 phút | `/api/health` + dịch vụ giám sát uptime |

Dữ liệu gồm 2 phần **sao lưu riêng biệt**:
1. **Database** (Postgres): học sinh, điểm danh, sổ liên lạc, học phí, tài khoản…
2. **File** (Supabase Storage): ảnh / video hoạt động, bài tập, khoảnh khắc, tệp chat. **Bản sao lưu database của Supabase KHÔNG gồm file.**

---

## 1. Sao lưu database — 3 lớp

### Lớp 1 · Sao lưu tự động của Supabase (bật sẵn từ gói Pro)
- Supabase Dashboard → **Database → Backups**. Gói Pro giữ 7 ngày, Team 14 ngày, Enterprise 30 ngày (kiểm tra lại trên trang giá của Supabase vì có thể thay đổi).
- **Gói Free không có bản sao lưu khôi phục được** → dữ liệu thật của trung tâm nên chạy trên gói Pro trở lên.

### Lớp 2 · Point-in-Time Recovery (PITR) — khuyến nghị
- Dashboard → **Project Settings → Add-ons → Point in Time Recovery** (cần gói Pro, tính phí theo số ngày giữ).
- Khôi phục về **bất kỳ thời điểm nào** (độ chính xác ~2 phút), vd. ngay trước lúc lỡ xoá một lớp.

### Lớp 3 · Bản dump mã hoá hằng ngày, lưu ngoài Supabase (đã có sẵn trong repo)
Phòng trường hợp mất quyền truy cập project / xoá nhầm cả project.

- Workflow: [`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml) — chạy **02:00 giờ Việt Nam mỗi ngày**:
  `pg_dump` (schema `public`, `auth`, `storage`) → kiểm tra bản dump đọc được và có các bảng chính → **mã hoá AES-256** → lưu GitHub Artifacts 30 ngày (+ tuỳ chọn gửi sang S3 / Cloudflare R2 / Backblaze B2).
- Thiết lập (1 lần):
  1. Đưa code lên GitHub (repo **private**).
  2. GitHub → Settings → Secrets and variables → Actions → tạo:
     - `SUPABASE_DB_URL`: Supabase → **Connect** → *Session pooler* (cổng 5432), thay `[YOUR-PASSWORD]` bằng mật khẩu database.
     - `BACKUP_PASSPHRASE`: chuỗi ngẫu nhiên ≥ 24 ký tự. **Lưu vào trình quản lý mật khẩu của trung tâm — mất là không giải mã được bản sao lưu.**
     - (tuỳ chọn) `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`.
  3. Tab **Actions → Database backup → Run workflow** để chạy thử ngay; kiểm tra có artifact `th-edu-db-…`.
- Sao lưu thủ công về máy: `scripts/backup-db.ps1` (Windows) hoặc `scripts/backup-db.sh` (Linux/macOS) — cần PostgreSQL Command Line Tools 17.

> Bản dump chứa **thông tin cá nhân của trẻ em** (họ tên, ngày sinh, SĐT phụ huynh). Không gửi qua Zalo / email, không để trên máy cá nhân không mã hoá. Thư mục `backups/` đã có trong `.gitignore`.

## 2. Sao lưu file (Storage)
Supabase Storage hỗ trợ giao thức S3 → đồng bộ sang kho ngoài bằng [rclone](https://rclone.org):

1. Supabase → **Storage → Settings → S3 Connection** → bật, tạo *Access key*.
2. Cấu hình rclone 2 remote: `supabase` (S3, endpoint `https://<ref>.supabase.co/storage/v1/s3`, region của project) và `backup` (R2 / B2 / S3 của trung tâm).
3. Chạy hằng tuần (Task Scheduler / cron / thêm 1 job vào workflow):
   ```bash
   for b in student-activities homework moments chat daily-media; do
     rclone sync "supabase:$b" "backup:th-edu-storage/$b" --fast-list --transfers 8
   done
   ```
   Dùng `sync` có thể xoá file ở kho sao lưu khi file gốc bị xoá; muốn giữ cả file đã xoá → `rclone copy` hoặc bật versioning trên kho sao lưu.

## 3. Khôi phục

### 3.1 Lỡ xoá / sửa nhầm vài bản ghi (thường gặp nhất)
Mọi thao tác thêm / sửa / xoá trên các bảng nhạy cảm đều nằm trong `audit_logs` kèm **dữ liệu cũ** (`old_data`).
Admin → **Nhật ký & bảo mật** để tìm; khôi phục 1 dòng bị xoá (SQL Editor):
```sql
-- Ví dụ: khôi phục điểm danh bị xoá lúc sáng nay
insert into public.attendance
select (jsonb_populate_record(null::public.attendance, old_data)).*
from public.audit_logs
where table_name = 'attendance' and action = 'DELETE' and created_at > now() - interval '6 hours';
```
(Cột `created_at` / `updated_at` không có trong `old_data` sẽ nhận giá trị mặc định.)

### 3.2 Hỏng / mất dữ liệu diện rộng
- **Có PITR:** Dashboard → Database → Backups → **Point in time** → chọn thời điểm ngay trước sự cố → Restore. Project ngừng phục vụ trong lúc khôi phục (vài phút → vài chục phút tuỳ dung lượng).
- **Không PITR:** Database → Backups → chọn bản hằng ngày → Restore (mất dữ liệu từ lúc sao lưu tới lúc sự cố).

### 3.3 Mất cả project — khôi phục từ bản dump (lớp 3)
1. Tải artifact, giải mã:
   ```bash
   gpg --decrypt th-edu-2026-10-28_0200.dump.gpg > th-edu.dump   # nhập BACKUP_PASSPHRASE
   ```
2. Tạo project Supabase mới, lấy `NEW_DB_URL` (Session pooler). Tạo lại các bucket Storage (`student-activities`, `homework`, `moments`, `chat`) nếu cần.
3. Khôi phục theo thứ tự (auth trước vì `profiles` tham chiếu `auth.users`):
   ```bash
   pg_restore --dbname "$NEW_DB_URL" --no-owner --no-privileges --data-only --schema=auth th-edu.dump
   pg_restore --dbname "$NEW_DB_URL" --no-owner --no-privileges --schema=public th-edu.dump
   pg_restore --dbname "$NEW_DB_URL" --no-owner --no-privileges --data-only --schema=storage --table=buckets --table=objects th-edu.dump
   ```
   Lỗi "already exists" ở các đối tượng Supabase tự tạo sẵn có thể bỏ qua; lỗi khác → dừng lại kiểm tra.
4. Chép file Storage từ kho sao lưu ngược về (`rclone sync backup:th-edu-storage/<bucket> supabase:<bucket>`).
5. Đổi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` trên Vercel → Redeploy → kiểm tra `/api/health` trả `"ok"`.

### 3.4 Diễn tập khôi phục — mỗi quý 1 lần
Khôi phục bản dump mới nhất vào 1 project thử nghiệm, mở app trỏ vào project đó, kiểm tra đăng nhập + số học sinh / điểm danh khớp. Ghi lại thời gian thực hiện (để biết RTO thật).

## 4. Toàn vẹn dữ liệu (khoá ngoại & cascade)

Quy ước trong database (kiểm tra ở Admin → **Giám sát hệ thống → Toàn vẹn dữ liệu**):

| Khi xoá… | Dữ liệu liên quan | Cách xử lý |
|---|---|---|
| Học sinh | điểm danh, sổ liên lạc, học phí + lịch sử đóng, bài nộp, đơn nghỉ, tổng kết tháng, gắn thẻ khoảnh khắc, thông báo | **Tự xoá theo** (`ON DELETE CASCADE`) |
| Học sinh | phản hồi phụ huynh, giao dịch ngân hàng, học sinh tiềm năng đã chuyển đổi | **Giữ lại, bỏ liên kết** (`SET NULL`) |
| Tài khoản phụ huynh | học sinh | Giữ học sinh, bỏ liên kết phụ huynh (`SET NULL`) |
| Tài khoản giáo viên | người chấm / người ghi | Giữ bản ghi, bỏ tên người thực hiện (`SET NULL`) |
| Lớp có học sinh | — | **Chặn xoá** (`RESTRICT`) — phải chuyển học sinh trước |
| Đổi tên lớp | học sinh, bài tập, khoảnh khắc | Tự cập nhật theo (`ON UPDATE CASCADE`) |
| Bài viết / bài tập / đơn / học phí / lịch học thử | thông báo trỏ tới (`notifications.ref_id`) | Trigger `notifications_cleanup_ref` tự xoá |
| Bất kỳ bản ghi nào ở trên | file ảnh / video trong Storage | **Không tự xoá được bằng SQL** → nút **Dọn file** ở Giám sát hệ thống (xoá qua Storage API) |

Migration `apply-monitoring.sql` còn tự tạo **index cho mọi cột khoá ngoại** để xoá / cập nhật không phải quét toàn bảng.

> Lưu ý nghiệp vụ: xoá học sinh sẽ xoá cả **lịch sử học phí** của bé. Bé nghỉ học → nên giữ hồ sơ (hoặc xuất báo cáo tài chính trước khi xoá). Bản ghi đã xoá vẫn còn trong `audit_logs` để tra cứu / khôi phục (mục 3.1).

## 5. Giám sát 24/7

### 5.1 Health check — `/api/health`
- `GET https://<tên-miền>/api/health` → `200 {"status":"ok"}` khi Database + Auth + Storage đều hoạt động; **`503`** khi `degraded` (vd. Storage lỗi → phụ huynh không xem được ảnh) hoặc `down` (Database lỗi). `HEAD` chỉ trả mã trạng thái.
- Bản công khai chỉ có trạng thái + độ trễ (kết quả dùng lại trong 10 giây). Chi tiết lỗi: thêm header `Authorization: Bearer <HEALTH_CHECK_SECRET>`.
- Thiết lập [UptimeRobot](https://uptimerobot.com) / [Better Stack](https://betterstack.com) (miễn phí): monitor kiểu HTTP(s), URL `/api/health`, chu kỳ 1–5 phút, cảnh báo qua email / Telegram / SMS cho người trực.

### 5.2 Nhật ký lỗi — Admin → **Giám sát hệ thống**
- Tự ghi nhận (bản production):
  - lỗi hiển thị trang ở cả 3 khu (error boundary riêng cho `/parent`, `/teacher`, `/admin`);
  - lỗi JS không được xử lý trên trình duyệt;
  - lỗi máy chủ (Server Component, Server Action, Route Handler — qua `src/instrumentation.ts`), gồm cả lỗi truy vấn Supabase đã được bắt và log;
  - lỗi tải ảnh / video (sổ liên lạc, bài tập, khoảnh khắc);
  - lỗi mất mạng: xếp hàng và gửi khi có mạng lại.
- Lỗi giống nhau được gom nhóm (đếm số lần, số người dùng bị ảnh hưởng, trang xảy ra, stack). Email / SĐT / token được che trước khi lưu. Tự giữ 90 ngày.

### 5.3 Sentry (tuỳ chọn, nên bật)
1. Tạo tài khoản [sentry.io](https://sentry.io) → New Project → *Next.js* → lấy **DSN**.
2. Vercel → Environment Variables → `SENTRY_DSN=<dsn>` → Redeploy.
Mọi lỗi ở mục 5.2 được gửi đồng thời sang Sentry (qua Envelope API, không cần cài SDK) để nhận cảnh báo email / Slack ngay khi phát sinh.
Muốn đủ tính năng của Sentry (source map, đo hiệu năng, session replay) → cài `@sentry/nextjs` theo hướng dẫn của Sentry; có thể giữ song song cơ chế hiện tại.

### 5.4 Biến môi trường

| Biến | Mục đích |
|---|---|
| `SENTRY_DSN` | Gửi lỗi sang Sentry (tuỳ chọn) |
| `HEALTH_CHECK_SECRET` | Xem chi tiết `/api/health` (≥ 16 ký tự; `CRON_SECRET` cũng dùng được) |
| `MONITORING_ENABLED` | `1` ép bật ghi lỗi phía server khi chạy dev, `0` tắt hẳn (mặc định: chỉ bật ở production) |
| `NEXT_PUBLIC_MONITORING_ENABLED` | Tương tự cho trình duyệt |

## 6. Khi có sự cố — checklist
1. Mở `/api/health` (kèm secret) → biết thành phần nào lỗi.
2. Kiểm tra [status.supabase.com](https://status.supabase.com) và [vercel-status.com](https://www.vercel-status.com) — sự cố từ nhà cung cấp → chờ, báo phụ huynh qua Zalo OA.
3. Admin → Giám sát hệ thống → xem nhóm lỗi mới nhất (thời điểm bắt đầu, trang, phiên bản). Lỗi bắt đầu ngay sau 1 lần deploy → Vercel → Deployments → **Promote** bản trước (quay lui trong 1 phút).
4. Mất / hỏng dữ liệu → **dừng thao tác ghi** (báo giáo viên tạm ngừng điểm danh), làm theo mục 3.
5. Sau sự cố: ghi lại nguyên nhân, thời gian phát hiện / khắc phục, việc cần làm để không lặp lại.
