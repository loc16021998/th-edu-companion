-- =============================================================================
-- Kiểm tra hiệu năng truy vấn trên dữ liệu thật (CHỈ ĐỌC — không thay đổi dữ liệu).
-- Supabase Dashboard → SQL Editor → dán từng khối → Run. Mục tiêu: "Execution Time" < 50 ms.
-- Trong kế hoạch truy vấn cần thấy "Index Scan" / "Index Only Scan" / "Bitmap Index Scan" trên bảng lớn;
-- "Seq Scan" trên bảng lớn (hàng chục nghìn dòng) = thiếu index.
-- Lưu ý: chạy trong SQL Editor là quyền postgres (bỏ qua RLS) — thời gian thực tế qua app có thêm chi phí RLS.
-- =============================================================================

-- 1. Lịch sử điểm danh 1 bé trong 3 tháng (trang Chuyên cần)
explain (analyze, buffers)
select date, status, note from public.attendance
where student_id = (select id from public.students order by created_at limit 1)
  and date between current_date - 90 and current_date
order by date;

-- 2. Sổ liên lạc gần nhất của 1 bé (trang Hôm nay)
explain (analyze, buffers)
select date, mood, subjects_summary, teacher_note from public.daily_reports
where student_id = (select id from public.students order by created_at limit 1)
order by date desc limit 10;

-- 3. Học phí của 1 bé, chưa đóng / còn thiếu (trang Học phí)
explain (analyze, buffers)
select id, title, amount, paid_amount, status, due_date from public.fees
where student_id = (select id from public.students order by created_at limit 1)
  and status in ('unpaid', 'partial')
order by due_date;

-- 4. Danh sách công nợ toàn trung tâm (Quản lý tài chính)
explain (analyze, buffers)
select id, student_id, amount, paid_amount, due_date from public.fees
where status in ('unpaid', 'partial') and due_date <= current_date
order by due_date;

-- 5. Học sinh 1 lớp (điểm danh của giáo viên)
explain (analyze, buffers)
select id, full_name, avatar_url from public.students
where (campus, class_name) = (select campus, name from public.classes limit 1)
order by full_name;

-- 6. Số thông báo chưa đọc (huy hiệu trên MỌI trang phụ huynh / giáo viên)
explain (analyze, buffers)
select type from public.notifications
where recipient_id = (select id from public.profiles where role = 'parent' limit 1) and read_at is null
limit 500;

-- -----------------------------------------------------------------------------
-- 7. Top 15 truy vấn tốn thời gian nhất từ khi reset thống kê (extension pg_stat_statements — bật sẵn trên Supabase)
-- -----------------------------------------------------------------------------
select round(mean_exec_time::numeric, 2) as tb_ms,
       round(max_exec_time::numeric, 2)  as max_ms,
       calls,
       round(total_exec_time::numeric)   as tong_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) as truy_van
from extensions.pg_stat_statements
where query ilike '%public.%' and query not ilike '%pg_stat%'
order by mean_exec_time desc
limit 15;

-- -----------------------------------------------------------------------------
-- 8. Bảng bị quét tuần tự nhiều (ứng viên thiếu index) — chỉ đáng lo khi bảng lớn
-- -----------------------------------------------------------------------------
select relname as bang, n_live_tup as so_dong, seq_scan, idx_scan,
       round(100.0 * seq_scan / nullif(seq_scan + idx_scan, 0), 1) as pct_seq
from pg_stat_user_tables
where schemaname = 'public' and n_live_tup > 1000
order by seq_scan desc
limit 15;

-- -----------------------------------------------------------------------------
-- 9. Index chưa từng được dùng (không gồm UNIQUE / khoá chính) — cân nhắc xoá nếu sau vài tuần vẫn = 0
-- -----------------------------------------------------------------------------
select s.relname as bang, s.indexrelname as index_name, pg_size_pretty(pg_relation_size(s.indexrelid)) as dung_luong, s.idx_scan
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public' and s.idx_scan = 0 and not i.indisunique and not i.indisprimary
order by pg_relation_size(s.indexrelid) desc;
