-- =============================================================================
-- Quản lý lớp học + chấm công giáo viên + lịch học cố định (Thứ 2 – Thứ 7, 18:00 – 19:30).
--
--  * classes: danh mục lớp theo cơ sở. students.(campus, class_name) và
--    teacher_assignments.(campus, class_name) tham chiếu tới đây (đổi tên lớp → tự cập nhật).
--    Phân công giáo viên vẫn nằm ở teacher_assignments (nguồn duy nhất cho RLS).
--  * teacher_attendance: admin chấm công giáo viên theo buổi.
--  * Chủ nhật không có buổi học → chặn ghi điểm danh / sổ liên lạc / chấm công vào Chủ nhật.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. classes
-- -----------------------------------------------------------------------------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  campus      public.campus not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint classes_campus_name_unique unique (campus, name),
  constraint classes_name_length check (length(trim(name)) between 1 and 30)
);
comment on table public.classes is 'Danh mục lớp học theo cơ sở. Buổi học: Thứ 2 – Thứ 7, 18:00 – 19:30.';

-- Lấy các lớp đang có sẵn (từ học sinh và phân công) trước khi gắn khoá ngoại
insert into public.classes (campus, name)
select distinct campus, class_name from public.students
union
select distinct campus, class_name from public.teacher_assignments where class_name is not null
on conflict do nothing;

alter table public.students
  add constraint students_class_fkey
  foreign key (campus, class_name) references public.classes (campus, name)
  on update cascade on delete restrict;

-- class_name NULL (phụ trách cả cơ sở) không bị ràng buộc (MATCH SIMPLE)
alter table public.teacher_assignments
  add constraint teacher_assignments_class_fkey
  foreign key (campus, class_name) references public.classes (campus, name)
  on update cascade on delete cascade;

alter table public.classes enable row level security;
revoke all on public.classes from anon;

create policy "admin_all_classes" on public.classes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "classes_teacher_select" on public.classes
  for select to authenticated
  using (public.teacher_manages(campus, name));

create policy "classes_parent_select" on public.classes
  for select to authenticated
  using (exists (
    select 1 from public.students s
    where s.parent_id = (select auth.uid()) and s.campus = classes.campus and s.class_name = classes.name
  ));

-- -----------------------------------------------------------------------------
-- 2. teacher_attendance — chấm công giáo viên theo buổi
-- -----------------------------------------------------------------------------
create table public.teacher_attendance (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles (id) on delete cascade,
  date         date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  status       public.attendance_status not null default 'present',
  note         text,
  recorded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint teacher_attendance_teacher_date_unique unique (teacher_id, date),
  constraint teacher_attendance_school_day check (extract(isodow from date) < 7),
  constraint teacher_attendance_note_length check (note is null or length(note) <= 200)
);
comment on table public.teacher_attendance is 'Chấm công giáo viên theo buổi (Thứ 2 – Thứ 7).';

create index teacher_attendance_date_idx on public.teacher_attendance (date);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger teacher_attendance_touch
  before update on public.teacher_attendance
  for each row execute function public.touch_updated_at();

alter table public.teacher_attendance enable row level security;
revoke all on public.teacher_attendance from anon;

create policy "admin_all_teacher_attendance" on public.teacher_attendance
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "teacher_attendance_select_own" on public.teacher_attendance
  for select to authenticated
  using (teacher_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. Không có buổi học Chủ nhật. NOT VALID: không kiểm tra dữ liệu cũ (vd. dữ liệu demo),
--    chỉ áp dụng cho bản ghi mới / được sửa.
-- -----------------------------------------------------------------------------
alter table public.attendance
  add constraint attendance_school_day check (extract(isodow from date) < 7) not valid;
alter table public.daily_reports
  add constraint daily_reports_school_day check (extract(isodow from date) < 7) not valid;

commit;
