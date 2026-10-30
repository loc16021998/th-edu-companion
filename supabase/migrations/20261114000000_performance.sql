-- =============================================================================
-- Tối ưu hiệu năng truy vấn (rà theo các truy vấn thật trong src/).
--
-- ĐÃ CÓ SẴN — không tạo lại (index trùng chỉ làm chậm mỗi lần ghi, không nhanh hơn khi đọc):
--   attendance    (student_id, date)   ← UNIQUE attendance_student_date_unique
--   daily_reports (student_id, date)   ← UNIQUE daily_reports_student_date_unique
--   students      (campus, class_name) ← students_campus_class_idx
--   notifications chưa đọc theo người nhận ← notifications_recipient_unread_idx (partial)
--   fees công nợ  (status, due_date)   ← fees_status_due_idx
--   leave_requests đang chờ duyệt      ← leave_requests_pending_idx (partial, huy hiệu menu giáo viên)
--
-- THÊM MỚI:
--   1. fees (student_id, status, due_date): trang Học phí của phụ huynh (lọc theo bé + trạng thái, sắp theo hạn đóng).
--      Thay thế fees_student_idx (student_id) — cột đầu trùng nên index cũ thừa.
--   2. teaching_sessions (teacher_id, date): lịch dạy / thu nhập của giáo viên (index cũ bắt đầu bằng date hoặc là partial).
--   3. profiles (phone): tìm tài khoản phụ huynh theo SĐT (chuyển lead → học viên, hỗ trợ đăng nhập).
--   4. RLS: 2 policy gọi current_user_role() trực tiếp → bọc (select …) để Postgres tính 1 lần / câu lệnh, không phải mỗi dòng.
--
-- Bảng nhỏ (vài nghìn dòng) nên tạo index thường chỉ khoá ghi trong tích tắc. Khi bảng rất lớn, chạy từng lệnh
-- CREATE INDEX CONCURRENTLY riêng lẻ (không bọc trong giao dịch) để không khoá ghi.
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- 1. Học phí theo bé
create index if not exists fees_student_status_idx on public.fees (student_id, status, due_date);
drop index if exists public.fees_student_idx;

-- 2. Ca dạy theo giáo viên (bảng có sau apply-teaching-payroll.sql)
do $$
begin
  if to_regclass('public.teaching_sessions') is not null then
    create index if not exists teaching_sessions_teacher_date_idx on public.teaching_sessions (teacher_id, date desc);
  end if;
end $$;

-- 3. Tìm hồ sơ theo SĐT
create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

-- 4. Policy: tính vai trò 1 lần / câu lệnh
do $$
begin
  if to_regclass('public.satisfaction_surveys') is not null then
    drop policy if exists "surveys_parent_insert" on public.satisfaction_surveys;
    create policy "surveys_parent_insert" on public.satisfaction_surveys
      for insert to authenticated
      with check (parent_id = (select auth.uid()) and (select public.current_user_role()) = 'parent');
  end if;
  if to_regclass('public.teacher_pay_rates') is not null then
    drop policy if exists "teacher_pay_rates_select_own" on public.teacher_pay_rates;
    create policy "teacher_pay_rates_select_own" on public.teacher_pay_rates
      for select to authenticated
      using ((select public.current_user_role()) = 'teacher' and (teacher_id is null or teacher_id = (select auth.uid())));
  end if;
end $$;

commit;

-- Cập nhật thống kê cho bộ lập kế hoạch truy vấn (ngoài giao dịch)
analyze public.fees;
analyze public.profiles;
analyze public.students;
analyze public.attendance;
analyze public.daily_reports;
analyze public.notifications;
