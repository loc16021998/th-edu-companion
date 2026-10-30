-- =============================================================================
-- Môn học học sinh đăng ký (Tiền tiểu học / Luyện chữ đẹp / Toán tư duy).
-- Phụ huynh chỉ xem tiến bộ của các môn con đã đăng ký. Quản trị viên chỉnh ở trang Học sinh.
-- Học sinh hiện có → mặc định đăng ký đủ 3 môn. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

alter table public.students
  add column if not exists subjects text[] not null default array['tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy'];

alter table public.students drop constraint if exists students_subjects_valid;
alter table public.students
  add constraint students_subjects_valid check (
    cardinality(subjects) between 1 and 3
    and subjects <@ array['tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy']
  );

comment on column public.students.subjects is 'Môn đăng ký: tien_tieu_hoc, luyen_chu, toan_tu_duy (ít nhất 1).';
