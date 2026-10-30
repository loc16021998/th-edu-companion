# Hiệu năng database — TH EDU Companion

Mục tiêu: truy vấn của các trang dùng hằng ngày (Hôm nay, Chuyên cần, Học phí, Điểm danh, huy hiệu thông báo) < 50 ms kể cả khi dữ liệu nhiều năm.

## 1. Index

Chạy `supabase/apply-performance.sql`. Đối chiếu từng truy vấn trong `src/` với index hiện có:

| Truy vấn | Index | Ghi chú |
|---|---|---|
| Lịch sử điểm danh 1 bé | `attendance (student_id, date)` | Có sẵn — ràng buộc UNIQUE tự tạo index |
| Sổ liên lạc 1 bé | `daily_reports (student_id, date)` | Có sẵn — UNIQUE |
| Học sinh 1 lớp | `students (campus, class_name)` | Có sẵn — `students_campus_class_idx` |
| Học phí 1 bé theo trạng thái | `fees (student_id, status, due_date)` | **Mới**; thay `fees_student_idx` (thừa) |
| Công nợ toàn trung tâm | `fees (status, due_date)` | Có sẵn |
| Huy hiệu thông báo chưa đọc | `notifications (recipient_id) where read_at is null` | Có sẵn — index một phần, rất nhỏ |
| Huy hiệu đơn xin nghỉ chờ duyệt | `leave_requests (created_at) where status = 'pending'` | Có sẵn — index một phần |
| Lịch dạy / thu nhập giáo viên | `teaching_sessions (teacher_id, date)` | **Mới** |
| Tìm phụ huynh theo SĐT | `profiles (phone)` | **Mới** |
| Xoá / cập nhật theo khoá ngoại | index cho mọi cột FK | Từ `apply-monitoring.sql` |

Không tạo lại index đã có: index trùng làm chậm mọi lần ghi (mỗi lần điểm danh ghi thêm vào từng index) mà không nhanh hơn khi đọc.

RLS: mọi policy gọi `auth.uid()` / `current_user_role()` đều bọc `(select …)` → Postgres tính 1 lần cho cả câu lệnh thay vì từng dòng; các hàm trợ giúp RLS là `STABLE`.

**Đo trên dữ liệu thật:** `supabase/tests/performance-check.sql` (chỉ đọc) — `EXPLAIN ANALYZE` 6 truy vấn nóng, top truy vấn chậm (`pg_stat_statements`), bảng bị quét tuần tự nhiều, index không dùng. Chạy lại mỗi học kỳ hoặc khi thấy app chậm.

## 2. Chỉ lấy cột cần thiết
Mọi truy vấn trong `src/` chỉ định cột cụ thể (`select("id, full_name, avatar_url")`), không `select("*")`. Khi viết truy vấn mới, giữ quy ước này — đặc biệt với cột nặng (`subjects_summary`, `media_urls`, `stack`, `context`).

## 3. Connection pooling

- App **không mở kết nối Postgres trực tiếp**: mọi truy vấn qua `supabase-js` là HTTP tới PostgREST, và PostgREST giữ sẵn một pool kết nối nhỏ tới Postgres. Nhiều người dùng cùng lúc **không** làm tăng số kết nối Postgres → không cần cấu hình pool trong code.
- Điều chỉnh khi cần: Supabase Dashboard → **Project Settings → Database → Connection pooling** (pool size theo cỡ compute). Truy vấn chậm giữ kết nối lâu → nghẽn pool; vì vậy index (mục 1) quan trọng hơn tăng pool.
- Kết nối trực tiếp duy nhất là bản sao lưu `pg_dump` (Session pooler, cổng 5432). Nếu sau này có job / script khác nối thẳng Postgres từ môi trường serverless → dùng **Transaction pooler (Supavisor, cổng 6543)**, không dùng cổng 5432 trực tiếp.
- **Realtime** mới là giới hạn dễ chạm giờ cao điểm: mỗi thiết bị đang mở app giữ 1 WebSocket (gói Free 200, Pro 500 kết nối đồng thời). App tự **đóng kết nối khi bị ẩn quá 60 giây** và mở lại khi quay về (`useIdleRealtime` trong `src/lib/supabase/lazy-client.ts`), nên chỉ thiết bị đang thật sự xem app mới chiếm kết nối.
- Client service-role phía server được dùng chung trong tiến trình (`src/lib/supabase/admin.ts`); client theo phiên người dùng tạo mới mỗi request (bắt buộc — gắn cookie của từng người).
