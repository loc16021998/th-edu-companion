-- =============================================================================
-- TH EDU Companion — Initial schema
-- Sổ liên lạc thông minh: profiles, students, attendance, daily_reports, fees
-- Target: Supabase (PostgreSQL 15+)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.roles as enum ('admin', 'teacher', 'parent');
create type public.campus as enum ('CS1_XALA', 'CS2_NGOTHINHAM');
create type public.attendance_status as enum ('present', 'absent', 'late');
create type public.mood as enum ('happy', 'neutral', 'focused', 'tired');
create type public.fee_status as enum ('unpaid', 'partial', 'paid');

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- 2.1 profiles — 1:1 với auth.users
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  role        public.roles not null default 'parent',
  phone       text,
  campus      public.campus,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9]{9,15}$')
);
comment on table public.profiles is 'Hồ sơ người dùng (admin / giáo viên / phụ huynh).';

-- 2.2 teacher_assignments — phạm vi phụ trách của giáo viên
--     class_name = NULL  => phụ trách TOÀN BỘ cơ sở (campus)
--     class_name = 'K1A' => chỉ phụ trách lớp K1A tại cơ sở đó
create table public.teacher_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  campus      public.campus not null,
  class_name  text,
  created_at  timestamptz not null default now(),
  constraint teacher_assignments_unique unique nulls not distinct (teacher_id, campus, class_name)
);
comment on table public.teacher_assignments is
  'Lớp/cơ sở giáo viên phụ trách. class_name NULL = toàn bộ cơ sở. Dùng cho RLS.';

-- 2.3 students
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  dob         date,
  class_name  text not null,
  parent_id   uuid references public.profiles (id) on delete set null,
  campus      public.campus not null,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  constraint students_dob_past check (dob is null or dob <= current_date)
);

-- 2.4 attendance — 1 bản ghi / học sinh / ngày
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  date        date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  status      public.attendance_status not null default 'present',
  note        text,
  created_at  timestamptz not null default now(),
  constraint attendance_student_date_unique unique (student_id, date)
);

-- 2.5 daily_reports
--   subjects_summary (JSONB), ví dụ:
--   {
--     "tien_tieu_hoc": { "rating": 4, "comment": "Nhận biết tốt các chữ cái" },
--     "luyen_chu":     { "rating": 3, "comment": "Cần giữ tư thế ngồi" },
--     "toan_tu_duy":   { "rating": 5, "comment": "Hoàn thành xuất sắc" }
--   }
create table public.daily_reports (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  teacher_id        uuid references public.profiles (id) on delete set null,
  date              date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  mood              public.mood,
  subjects_summary  jsonb  not null default '{}'::jsonb,
  media_urls        text[] not null default '{}',
  teacher_note      text,
  created_at        timestamptz not null default now(),
  constraint daily_reports_student_date_unique unique (student_id, date),
  constraint daily_reports_subjects_is_object check (jsonb_typeof(subjects_summary) = 'object'),
  constraint daily_reports_media_limit check (cardinality(media_urls) <= 20)
);

-- 2.6 fees
create table public.fees (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  title        text not null,
  amount       numeric(12, 0) not null,
  paid_amount  numeric(12, 0) not null default 0,
  status       public.fee_status not null default 'unpaid',
  due_date     date,
  created_at   timestamptz not null default now(),
  constraint fees_amount_positive check (amount >= 0),
  constraint fees_paid_range check (paid_amount >= 0 and paid_amount <= amount)
);
comment on column public.fees.status is 'Tự động đồng bộ theo paid_amount/amount (trigger fees_sync_status).';

-- -----------------------------------------------------------------------------
-- 3. Indexes (phục vụ cả truy vấn app lẫn các điều kiện RLS)
-- -----------------------------------------------------------------------------
create index profiles_role_idx              on public.profiles (role);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);
create index students_parent_idx            on public.students (parent_id);
create index students_campus_class_idx      on public.students (campus, class_name);
create index attendance_date_idx            on public.attendance (date);
create index daily_reports_teacher_idx      on public.daily_reports (teacher_id);
create index daily_reports_date_idx         on public.daily_reports (date);
create index fees_student_idx               on public.fees (student_id);
create index fees_status_due_idx            on public.fees (status, due_date);

-- -----------------------------------------------------------------------------
-- 4. Helper functions cho RLS
--    SECURITY DEFINER + search_path rỗng: bỏ qua RLS bên trong để tránh
--    đệ quy policy, và chống search_path hijacking.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.roles
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

-- Giáo viên hiện tại có phụ trách (campus, class_name) không?
create or replace function public.teacher_manages(p_campus public.campus, p_class_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_assignments ta
    join public.profiles p on p.id = ta.teacher_id and p.role = 'teacher'
    where ta.teacher_id = (select auth.uid())
      and ta.campus = p_campus
      and (ta.class_name is null or ta.class_name = p_class_name)
  );
$$;

-- Giáo viên hiện tại có phụ trách học sinh này không?
create or replace function public.teacher_can_access_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and public.teacher_manages(s.campus, s.class_name)
  );
$$;

-- Người dùng hiện tại có phải phụ huynh của học sinh này không?
create or replace function public.is_parent_of(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.parent_id = (select auth.uid())
  );
$$;

-- Giáo viên có quyền xem hồ sơ phụ huynh của học sinh mình phụ trách
create or replace function public.teacher_can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.parent_id = p_profile_id
      and public.teacher_manages(s.campus, s.class_name)
  );
$$;

-- Phụ huynh có quyền xem hồ sơ giáo viên đã viết nhận xét/phụ trách con mình
create or replace function public.parent_can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_assignments ta
      on ta.campus = s.campus
     and (ta.class_name is null or ta.class_name = s.class_name)
    where s.parent_id = (select auth.uid())
      and ta.teacher_id = p_profile_id
  )
  or exists (
    select 1
    from public.daily_reports dr
    join public.students s on s.id = dr.student_id
    where s.parent_id = (select auth.uid())
      and dr.teacher_id = p_profile_id
  );
$$;

-- Chỉ cho phép role đã đăng nhập gọi các helper
revoke execute on function
  public.current_user_role(),
  public.is_admin(),
  public.teacher_manages(public.campus, text),
  public.teacher_can_access_student(uuid),
  public.is_parent_of(uuid),
  public.teacher_can_view_profile(uuid),
  public.parent_can_view_profile(uuid)
from public, anon;

grant execute on function
  public.current_user_role(),
  public.is_admin(),
  public.teacher_manages(public.campus, text),
  public.teacher_can_access_student(uuid),
  public.is_parent_of(uuid),
  public.teacher_can_view_profile(uuid),
  public.parent_can_view_profile(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------

-- 5.1 Tự tạo profile khi có user mới trong auth.users.
--     KHÔNG đọc role từ user metadata (client tự set được) — luôn mặc định 'parent'.
--     Admin nâng quyền thủ công sau.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.2 Chặn người dùng thường tự đổi role / campus của chính mình.
--     auth.uid() IS NULL => service_role / SQL editor => cho phép.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (new.role   is distinct from old.role
       or new.campus is distinct from old.campus
       or new.id     is distinct from old.id) then
    raise exception 'Không có quyền thay đổi role/campus'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- 5.3 Đồng bộ fees.status theo số tiền đã đóng
create or replace function public.fees_sync_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.status := case
    when new.paid_amount >= new.amount and new.amount > 0 then 'paid'::public.fee_status
    when new.paid_amount > 0                              then 'partial'::public.fee_status
    else                                                       'unpaid'::public.fee_status
  end;
  return new;
end;
$$;

create trigger fees_sync_status
  before insert or update of amount, paid_amount on public.fees
  for each row execute function public.fees_sync_status();

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.students            enable row level security;
alter table public.attendance          enable row level security;
alter table public.daily_reports       enable row level security;
alter table public.fees                enable row level security;

-- anon không có quyền gì trên dữ liệu nghiệp vụ
revoke all on
  public.profiles, public.teacher_assignments, public.students,
  public.attendance, public.daily_reports, public.fees
from anon;

-- ===================== ADMIN: ALL trên mọi bảng =============================
create policy "admin_all_profiles" on public.profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_all_teacher_assignments" on public.teacher_assignments
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_all_students" on public.students
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_all_attendance" on public.attendance
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_all_daily_reports" on public.daily_reports
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_all_fees" on public.fees
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ===================== PROFILES =============================================
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));   -- role/campus được chặn bởi trigger 5.2

create policy "profiles_teacher_select_parents" on public.profiles
  for select to authenticated
  using (public.teacher_can_view_profile(id));

create policy "profiles_parent_select_teachers" on public.profiles
  for select to authenticated
  using (public.parent_can_view_profile(id));

-- ===================== TEACHER_ASSIGNMENTS ==================================
create policy "teacher_assignments_select_own" on public.teacher_assignments
  for select to authenticated
  using (teacher_id = (select auth.uid()));

-- ===================== STUDENTS =============================================
create policy "students_parent_select" on public.students
  for select to authenticated
  using (parent_id = (select auth.uid()));

create policy "students_teacher_select" on public.students
  for select to authenticated
  using (public.teacher_manages(campus, class_name));

-- Giáo viên cập nhật thông tin học sinh trong phạm vi; không được chuyển HS ra ngoài phạm vi.
-- Thêm/xoá học sinh là nghiệp vụ của admin.
create policy "students_teacher_update" on public.students
  for update to authenticated
  using (public.teacher_manages(campus, class_name))
  with check (public.teacher_manages(campus, class_name));

-- ===================== ATTENDANCE ===========================================
create policy "attendance_parent_select" on public.attendance
  for select to authenticated
  using (public.is_parent_of(student_id));

create policy "attendance_teacher_select" on public.attendance
  for select to authenticated
  using (public.teacher_can_access_student(student_id));

create policy "attendance_teacher_insert" on public.attendance
  for insert to authenticated
  with check (public.teacher_can_access_student(student_id));

create policy "attendance_teacher_update" on public.attendance
  for update to authenticated
  using (public.teacher_can_access_student(student_id))
  with check (public.teacher_can_access_student(student_id));

create policy "attendance_teacher_delete" on public.attendance
  for delete to authenticated
  using (public.teacher_can_access_student(student_id));

-- ===================== DAILY_REPORTS ========================================
create policy "daily_reports_parent_select" on public.daily_reports
  for select to authenticated
  using (public.is_parent_of(student_id));

create policy "daily_reports_teacher_select" on public.daily_reports
  for select to authenticated
  using (public.teacher_can_access_student(student_id));

-- Giáo viên chỉ được tạo nhận xét đứng tên chính mình
create policy "daily_reports_teacher_insert" on public.daily_reports
  for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    and public.teacher_can_access_student(student_id)
  );

create policy "daily_reports_teacher_update" on public.daily_reports
  for update to authenticated
  using (public.teacher_can_access_student(student_id))
  with check (
    teacher_id = (select auth.uid())
    and public.teacher_can_access_student(student_id)
  );

create policy "daily_reports_teacher_delete" on public.daily_reports
  for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and public.teacher_can_access_student(student_id)
  );

-- ===================== FEES =================================================
create policy "fees_parent_select" on public.fees
  for select to authenticated
  using (public.is_parent_of(student_id));

create policy "fees_teacher_select" on public.fees
  for select to authenticated
  using (public.teacher_can_access_student(student_id));

-- Mặc định giáo viên CHỈ XEM học phí (dữ liệu tài chính do admin/kế toán quản lý).
-- Nếu muốn cho giáo viên ghi nhận thu tiền, bỏ comment khối dưới:
--
-- create policy "fees_teacher_write" on public.fees
--   for all to authenticated
--   using (public.teacher_can_access_student(student_id))
--   with check (public.teacher_can_access_student(student_id));

-- -----------------------------------------------------------------------------
-- 7. Storage bucket cho ảnh/video nhận xét hằng ngày
--    Đường dẫn file quy ước: {student_id}/{yyyy-mm-dd}/{filename}
-- -----------------------------------------------------------------------------

-- Ép kiểu text -> uuid an toàn (trả NULL thay vì raise lỗi với path không hợp lệ)
create or replace function public.safe_uuid(p text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end;
$$;

insert into storage.buckets (id, name, public)
values ('daily-media', 'daily-media', false)
on conflict (id) do nothing;

create policy "daily_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'daily-media'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "daily_media_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'daily-media'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "daily_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'daily-media'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

commit;
