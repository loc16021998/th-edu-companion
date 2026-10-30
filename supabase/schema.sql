-- Ghép tất cả file trong supabase/migrations/ theo thứ tự — dán vào SQL Editor nếu không dùng Supabase CLI.

-- >>> supabase/migrations/20261021000000_init_schema.sql
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

-- >>> supabase/migrations/20261021020000_student_activities_bucket.sql
-- =============================================================================
-- Chuyển media nhận xét hằng ngày sang bucket `student-activities`.
-- Bucket PRIVATE (ảnh trẻ em): media_urls lưu đường dẫn {student_id}/{yyyy-mm-dd}/{file},
-- phụ huynh xem qua signed URL ngắn hạn do server tạo.
-- =============================================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-activities', 'student-activities', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "student_activities_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Giáo viên chỉ tải lên thư mục của học sinh mình phụ trách
create policy "student_activities_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "student_activities_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Gỡ bucket cũ `daily-media`
drop policy if exists "daily_media_read" on storage.objects;
drop policy if exists "daily_media_write" on storage.objects;
drop policy if exists "daily_media_delete" on storage.objects;

do $$
begin
  delete from storage.buckets where id = 'daily-media';
exception when others then
  -- Một số phiên bản Supabase chặn xoá trực tiếp bảng storage → xoá thủ công trong Dashboard
  raise notice 'Không xoá được bucket daily-media (%): hãy xoá trong Dashboard > Storage', sqlerrm;
end $$;

commit;

-- >>> supabase/migrations/20261022000000_notifications.sql
-- =============================================================================
-- Bản tin / thông báo cho phụ huynh.
-- Bản ghi được sinh TỰ ĐỘNG bằng trigger khi giáo viên điểm danh hoặc viết sổ liên lạc
-- → không phụ thuộc client, nguyên tử cùng giao dịch ghi dữ liệu gốc.
--
-- Chống spam: mỗi (phụ huynh, học sinh, loại, ngày) chỉ có 1 thông báo. Giáo viên sửa lại
-- điểm danh/sổ → thông báo cũ được cập nhật nội dung và đánh dấu CHƯA ĐỌC lại.
-- =============================================================================
begin;

create type public.notification_type as enum ('daily_report', 'attendance');

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  type          public.notification_type not null,
  ref_date      date not null,
  title         text not null,
  body          text not null default '',
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint notifications_dedupe unique (recipient_id, student_id, type, ref_date)
);
comment on table public.notifications is
  'Bản tin cho phụ huynh, sinh bởi trigger trên attendance / daily_reports.';

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx  on public.notifications (recipient_id) where read_at is null;
create index notifications_student_idx           on public.notifications (student_id);

-- -----------------------------------------------------------------------------
-- Helper: ghi (hoặc làm mới) thông báo cho phụ huynh của học sinh
-- -----------------------------------------------------------------------------
create or replace function public.notify_parent(
  p_student_id uuid,
  p_type       public.notification_type,
  p_ref_date   date,
  p_title      text,
  p_body       text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent uuid;
begin
  select s.parent_id into v_parent from public.students s where s.id = p_student_id;
  if v_parent is null then
    return; -- học sinh chưa gắn tài khoản phụ huynh
  end if;

  insert into public.notifications as n (recipient_id, student_id, type, ref_date, title, body)
  values (v_parent, p_student_id, p_type, p_ref_date, p_title, coalesce(p_body, ''))
  on conflict (recipient_id, student_id, type, ref_date) do update
    set title      = excluded.title,
        body       = excluded.body,
        read_at    = null,
        created_at = now();
end;
$$;

-- Chỉ trigger (chạy với quyền owner) được gọi
revoke execute on function public.notify_parent(uuid, public.notification_type, date, text, text) from public, anon, authenticated;

-- Tên gọi thân mật: "Nguyễn Minh An" → "An"
create or replace function public.given_name(p_full_name text)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(nullif(regexp_replace(trim(p_full_name), '^.*\s', ''), ''), trim(p_full_name));
$$;

-- -----------------------------------------------------------------------------
-- Trigger: điểm danh
-- -----------------------------------------------------------------------------
create or replace function public.attendance_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_label text;
begin
  -- Lưu lại cả lớp nhưng trạng thái/ghi chú của bé không đổi → không làm phiền phụ huynh
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.note is not distinct from old.note then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  v_label := case new.status
    when 'present' then 'Có mặt'
    when 'late'    then 'Đi muộn'
    when 'absent'  then 'Nghỉ học'
  end;

  perform public.notify_parent(
    new.student_id,
    'attendance',
    new.date,
    format('Bé %s: %s', coalesce(v_name, ''), v_label),
    case
      when nullif(trim(new.note), '') is not null then format('Ghi chú của giáo viên: %s', trim(new.note))
      when new.status = 'present' then 'Con đã đến lớp an toàn.'
      when new.status = 'late'    then 'Con đã đến lớp (muộn).'
      else 'Nhà trường đã ghi nhận con nghỉ học.'
    end
  );
  return new;
end;
$$;

create trigger attendance_notify
  after insert or update of status, note on public.attendance
  for each row execute function public.attendance_notify();

-- -----------------------------------------------------------------------------
-- Trigger: sổ liên lạc
-- -----------------------------------------------------------------------------
create or replace function public.daily_report_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name    text;
  v_teacher text;
  v_body    text;
  v_media   int := cardinality(new.media_urls);
begin
  if tg_op = 'UPDATE'
     and new.mood             is not distinct from old.mood
     and new.subjects_summary is not distinct from old.subjects_summary
     and new.media_urls       is not distinct from old.media_urls
     and new.teacher_note     is not distinct from old.teacher_note then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  select nullif(trim(p.full_name), '') into v_teacher from public.profiles p where p.id = new.teacher_id;

  v_body := coalesce(nullif(trim(new.teacher_note), ''), 'Giáo viên đã cập nhật nhận xét và đánh giá các môn học.');
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;
  if v_media > 0 then
    v_body := v_body || format(' 📸 %s ảnh/video.', v_media);
  end if;

  perform public.notify_parent(
    new.student_id,
    'daily_report',
    new.date,
    case
      when v_teacher is not null then format('%s đã viết sổ liên lạc cho bé %s', v_teacher, coalesce(v_name, ''))
      else format('Sổ liên lạc mới của bé %s', coalesce(v_name, ''))
    end,
    v_body
  );
  return new;
end;
$$;

create trigger daily_report_notify
  after insert or update on public.daily_reports
  for each row execute function public.daily_report_notify();

-- -----------------------------------------------------------------------------
-- RLS: phụ huynh chỉ xem / đánh dấu đã đọc / xoá thông báo của chính mình.
-- Không có policy INSERT → chỉ trigger (security definer) tạo được thông báo.
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
-- Chỉ được sửa cột read_at (không sửa nội dung / người nhận)
grant update (read_at) on public.notifications to authenticated;

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()));

create policy "admin_select_notifications" on public.notifications
  for select to authenticated
  using ((select public.is_admin()));

-- Realtime: chuông cập nhật số chưa đọc ngay khi có thông báo mới (Realtime tôn trọng RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;

-- >>> supabase/migrations/20261023000000_classes_teacher_attendance.sql
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

-- >>> supabase/migrations/20261024000000_feedback.sql
-- =============================================================================
-- Phản hồi của phụ huynh gửi trung tâm (góp ý, thắc mắc) + trả lời của quản trị viên.
-- =============================================================================
begin;

create type public.feedback_status as enum ('new', 'in_progress', 'resolved');

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid references public.students (id) on delete set null,
  category     text not null,
  content      text not null,
  status       public.feedback_status not null default 'new',
  admin_reply  text,
  replied_by   uuid references public.profiles (id) on delete set null,
  replied_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint feedback_category_valid check (category in ('hoc_tap', 'lich_hoc', 'hoc_phi', 'giao_vien', 'co_so_vat_chat', 'khac')),
  constraint feedback_content_length check (length(trim(content)) between 5 and 2000),
  constraint feedback_reply_length check (admin_reply is null or length(admin_reply) <= 2000)
);
comment on table public.feedback is 'Phản hồi phụ huynh gửi trung tâm; quản trị viên trả lời.';

create index feedback_parent_created_idx on public.feedback (parent_id, created_at desc);
create index feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon;

-- Phụ huynh: gửi phản hồi đứng tên mình (về con mình hoặc chung), xem phản hồi của mình.
-- Không sửa/xoá — giữ nguyên lịch sử trao đổi.
create policy "feedback_parent_insert" on public.feedback
  for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and status = 'new'
    and admin_reply is null
    and replied_by is null
    and replied_at is null
    and (student_id is null or public.is_parent_of(student_id))
  );

create policy "feedback_parent_select" on public.feedback
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- Quản trị viên: xem tất cả, trả lời, đổi trạng thái
create policy "admin_all_feedback" on public.feedback
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

commit;

-- >>> supabase/migrations/20261025000000_feedback_notifications.sql
-- =============================================================================
-- Thông báo cho phụ huynh khi nhà trường trả lời phản hồi (bảng feedback).
-- Cần chạy SAU migration 20261024000000_feedback.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch, nên giá trị enum 'feedback' vừa thêm
-- KHÔNG được dùng trực tiếp trong script (lỗi 55P04). Ràng buộc bên dưới so sánh dạng text
-- (type::text), còn trigger chỉ dùng giá trị mới khi chạy — sau khi giao dịch đã commit.
-- =============================================================================

alter type public.notification_type add value if not exists 'feedback';

-- Phản hồi có thể không gắn với bé nào → student_id được phép rỗng cho loại 'feedback'
alter table public.notifications alter column student_id drop not null;
alter table public.notifications
  add column if not exists feedback_id uuid references public.feedback (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_student_required;
alter table public.notifications
  add constraint notifications_student_required check (type::text = 'feedback' or student_id is not null);

-- Mỗi phản hồi chỉ 1 thông báo; trả lời lại → làm mới thông báo đó
create unique index if not exists notifications_feedback_unique
  on public.notifications (feedback_id) where feedback_id is not null;

create or replace function public.feedback_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_body text;
begin
  if new.admin_reply is null or trim(new.admin_reply) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.admin_reply is not distinct from old.admin_reply then
    return new; -- chỉ đổi trạng thái, không đổi nội dung trả lời
  end if;

  v_body := trim(new.admin_reply);
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;

  insert into public.notifications (recipient_id, student_id, feedback_id, type, ref_date, title, body)
  values (
    new.parent_id,
    new.student_id,
    new.id,
    'feedback'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'Nhà trường đã trả lời phản hồi của anh/chị',
    v_body
  )
  on conflict (feedback_id) where feedback_id is not null do update
    set title      = excluded.title,
        body       = excluded.body,
        ref_date   = excluded.ref_date,
        read_at    = null,
        created_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_reply_notify on public.feedback;
create trigger feedback_reply_notify
  after insert or update of admin_reply on public.feedback
  for each row execute function public.feedback_reply_notify();

-- >>> supabase/migrations/20261026000000_class_shifts.sql
-- =============================================================================
-- Ca học: quản trị viên tạo ca (giờ bắt đầu/kết thúc + các ngày trong tuần) và gán cho lớp.
-- Chỉ quản trị viên được tạo / sửa / xoá; mọi người đã đăng nhập được xem.
-- Lớp chưa gán ca → dùng lịch mặc định của ứng dụng (Thứ 2 – Thứ 7, 18:00 – 19:30).
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create table if not exists public.class_shifts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  -- Ngày học theo ISO: 1 = Thứ 2 … 6 = Thứ 7, 7 = Chủ nhật
  weekdays    smallint[] not null default '{1,2,3,4,5,6}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint class_shifts_name_unique unique (name),
  constraint class_shifts_name_length check (length(trim(name)) between 1 and 60),
  constraint class_shifts_time_order check (end_time > start_time),
  constraint class_shifts_weekdays_valid check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);
comment on table public.class_shifts is 'Ca học (giờ + ngày trong tuần) do quản trị viên tạo, gán cho lớp qua classes.shift_id.';

alter table public.classes
  add column if not exists shift_id uuid references public.class_shifts (id) on delete set null;
create index if not exists classes_shift_idx on public.classes (shift_id);

alter table public.class_shifts enable row level security;
revoke all on public.class_shifts from anon;

drop policy if exists "admin_all_class_shifts" on public.class_shifts;
create policy "admin_all_class_shifts" on public.class_shifts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Giáo viên / phụ huynh chỉ XEM (lịch học của lớp); không có policy ghi → không tạo/sửa được
drop policy if exists "class_shifts_select_authenticated" on public.class_shifts;
create policy "class_shifts_select_authenticated" on public.class_shifts
  for select to authenticated
  using (true);

-- >>> supabase/migrations/20261027000000_monthly_summaries.sql
-- =============================================================================
-- Nhận xét tổng kết tháng (AI soạn nháp → giáo viên xem lại / sửa → "Gửi cho phụ huynh").
-- Phụ huynh chỉ thấy bản ĐÃ GỬI; gửi xong phụ huynh nhận thông báo (chuông).
-- Cần đã chạy migration thông báo (notifications). Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch → không dùng trực tiếp giá trị enum mới
-- 'monthly_summary' trong script (lỗi 55P04); trigger chỉ dùng khi chạy, lúc đó giá trị đã được commit.
-- =============================================================================

alter type public.notification_type add value if not exists 'monthly_summary';

create table if not exists public.monthly_summaries (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  -- Ngày đầu tháng (YYYY-MM-01)
  month         date not null,
  content       text not null,
  status        text not null default 'draft',
  ai_generated  boolean not null default false,
  teacher_id    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  constraint monthly_summaries_student_month_unique unique (student_id, month),
  constraint monthly_summaries_month_first_day check (extract(day from month) = 1),
  constraint monthly_summaries_status_valid check (status in ('draft', 'sent')),
  constraint monthly_summaries_content_length check (length(trim(content)) between 1 and 6000)
);
comment on table public.monthly_summaries is 'Nhận xét tổng kết tháng của từng học sinh; phụ huynh chỉ xem bản đã gửi.';

create index if not exists monthly_summaries_student_idx on public.monthly_summaries (student_id, month desc);

drop trigger if exists monthly_summaries_touch on public.monthly_summaries;
create trigger monthly_summaries_touch
  before update on public.monthly_summaries
  for each row execute function public.touch_updated_at();

alter table public.monthly_summaries enable row level security;
revoke all on public.monthly_summaries from anon;

drop policy if exists "admin_all_monthly_summaries" on public.monthly_summaries;
create policy "admin_all_monthly_summaries" on public.monthly_summaries
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Giáo viên: toàn quyền với học sinh mình phụ trách
drop policy if exists "monthly_summaries_teacher_all" on public.monthly_summaries;
create policy "monthly_summaries_teacher_all" on public.monthly_summaries
  for all to authenticated
  using (public.teacher_can_access_student(student_id))
  with check (public.teacher_can_access_student(student_id));

-- Phụ huynh: chỉ XEM bản đã gửi của con mình
drop policy if exists "monthly_summaries_parent_select" on public.monthly_summaries;
create policy "monthly_summaries_parent_select" on public.monthly_summaries
  for select to authenticated
  using (status = 'sent' and public.is_parent_of(student_id));

-- Thông báo khi gửi (lần đầu hoặc gửi lại bản đã sửa)
create or replace function public.monthly_summary_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_body text;
begin
  if new.status <> 'sent' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'sent' and new.content is not distinct from old.content then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  v_body := trim(new.content);
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;

  perform public.notify_parent(
    new.student_id,
    'monthly_summary'::text::public.notification_type,
    new.month,
    format('Nhận xét tổng kết tháng %s của bé %s', to_char(new.month, 'MM/YYYY'), coalesce(v_name, '')),
    v_body
  );
  return new;
end;
$$;

drop trigger if exists monthly_summary_notify on public.monthly_summaries;
create trigger monthly_summary_notify
  after insert or update of status, content on public.monthly_summaries
  for each row execute function public.monthly_summary_notify();

-- >>> supabase/migrations/20261028000000_student_subjects.sql
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

-- >>> supabase/migrations/20261029000000_homework.sql
-- =============================================================================
-- "Góc Đồng Hành Tại Nhà": giáo viên giao bài tập cho lớp → phụ huynh nộp ảnh/video bài làm của bé
-- → giáo viên chấm (thả tim, nhận xét chữ, lời nhắn thoại, tặng 1–3 sao) → bảng xếp hạng "Ngôi sao chăm chỉ" theo tuần.
-- Cần đã chạy các migration: classes, notifications. Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch → không dùng trực tiếp giá trị enum mới trong script
-- (lỗi 55P04); trigger chỉ dùng khi chạy (sau khi commit) qua phép ép kiểu từ text.
-- =============================================================================

alter type public.notification_type add value if not exists 'homework_assigned';
alter type public.notification_type add value if not exists 'homework_graded';

-- -----------------------------------------------------------------------------
-- 1. Bài tập (giao cho cả lớp)
-- -----------------------------------------------------------------------------
create table if not exists public.homework_assignments (
  id               uuid primary key default gen_random_uuid(),
  campus           public.campus not null,
  class_name       text not null,
  subject          text,
  title            text not null,
  instructions     text not null default '',
  submission_type  text not null default 'any',
  due_date         date,
  teacher_id       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint homework_assignments_class_fkey foreign key (campus, class_name)
    references public.classes (campus, name) on update cascade on delete cascade,
  constraint homework_assignments_title_length check (length(trim(title)) between 2 and 120),
  constraint homework_assignments_instructions_length check (length(instructions) <= 1500),
  constraint homework_assignments_type_valid check (submission_type in ('photo', 'video', 'any')),
  constraint homework_assignments_subject_valid check (subject is null or subject in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy'))
);
create index if not exists homework_assignments_class_idx on public.homework_assignments (campus, class_name, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Bài nộp (mỗi bé nộp 1 lần / bài, sửa được khi cô chưa chấm)
-- -----------------------------------------------------------------------------
create table if not exists public.homework_submissions (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references public.homework_assignments (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  parent_id        uuid references public.profiles (id) on delete set null,
  media_paths      text[] not null default '{}',
  parent_note      text,
  status           text not null default 'submitted',
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  hearted          boolean not null default false,
  teacher_comment  text,
  voice_path       text,
  stars            smallint,
  graded_by        uuid references public.profiles (id) on delete set null,
  graded_at        timestamptz,
  constraint homework_submissions_unique unique (assignment_id, student_id),
  constraint homework_submissions_status_valid check (status in ('submitted', 'graded')),
  constraint homework_submissions_media_count check (cardinality(media_paths) between 1 and 10),
  constraint homework_submissions_stars_range check (stars is null or stars between 1 and 3),
  constraint homework_submissions_note_length check (parent_note is null or length(parent_note) <= 500),
  constraint homework_submissions_comment_length check (teacher_comment is null or length(teacher_comment) <= 1000)
);
create index if not exists homework_submissions_assignment_idx on public.homework_submissions (assignment_id);
create index if not exists homework_submissions_student_idx on public.homework_submissions (student_id);
create index if not exists homework_submissions_graded_idx on public.homework_submissions (graded_at) where status = 'graded';

drop trigger if exists homework_submissions_touch on public.homework_submissions;
create trigger homework_submissions_touch
  before update on public.homework_submissions
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
alter table public.homework_assignments enable row level security;
alter table public.homework_submissions enable row level security;
revoke all on public.homework_assignments, public.homework_submissions from anon;

-- Bài tập: quản trị toàn quyền; giáo viên quản lý lớp mình; phụ huynh xem bài của lớp con mình
drop policy if exists "admin_all_homework_assignments" on public.homework_assignments;
create policy "admin_all_homework_assignments" on public.homework_assignments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "homework_assignments_teacher_all" on public.homework_assignments;
create policy "homework_assignments_teacher_all" on public.homework_assignments
  for all to authenticated
  using (public.teacher_manages(campus, class_name))
  with check (public.teacher_manages(campus, class_name) and teacher_id = (select auth.uid()));

drop policy if exists "homework_assignments_parent_select" on public.homework_assignments;
create policy "homework_assignments_parent_select" on public.homework_assignments
  for select to authenticated
  using (exists (
    select 1 from public.students s
    where s.parent_id = (select auth.uid()) and s.campus = homework_assignments.campus and s.class_name = homework_assignments.class_name
  ));

-- Bài nộp
drop policy if exists "admin_all_homework_submissions" on public.homework_submissions;
create policy "admin_all_homework_submissions" on public.homework_submissions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Giáo viên: xem + chấm bài của học sinh mình phụ trách (không tạo bài nộp thay phụ huynh)
drop policy if exists "homework_submissions_teacher_select" on public.homework_submissions;
create policy "homework_submissions_teacher_select" on public.homework_submissions
  for select to authenticated using (public.teacher_can_access_student(student_id));

drop policy if exists "homework_submissions_teacher_update" on public.homework_submissions;
create policy "homework_submissions_teacher_update" on public.homework_submissions
  for update to authenticated
  using (public.teacher_can_access_student(student_id))
  with check (public.teacher_can_access_student(student_id));

-- Phụ huynh: xem bài của con; nộp / sửa bài KHI CÔ CHƯA CHẤM; không tự đặt tim / sao / nhận xét
drop policy if exists "homework_submissions_parent_select" on public.homework_submissions;
create policy "homework_submissions_parent_select" on public.homework_submissions
  for select to authenticated using (public.is_parent_of(student_id));

drop policy if exists "homework_submissions_parent_insert" on public.homework_submissions;
create policy "homework_submissions_parent_insert" on public.homework_submissions
  for insert to authenticated
  with check (
    public.is_parent_of(student_id)
    and parent_id = (select auth.uid())
    and status = 'submitted' and hearted = false and stars is null
    and teacher_comment is null and voice_path is null and graded_by is null and graded_at is null
    and exists (
      select 1 from public.homework_assignments a join public.students s on s.id = student_id
      where a.id = assignment_id and a.campus = s.campus and a.class_name = s.class_name
    )
  );

drop policy if exists "homework_submissions_parent_update" on public.homework_submissions;
create policy "homework_submissions_parent_update" on public.homework_submissions
  for update to authenticated
  using (public.is_parent_of(student_id) and status = 'submitted')
  with check (
    public.is_parent_of(student_id)
    and status = 'submitted' and hearted = false and stars is null
    and teacher_comment is null and voice_path is null and graded_by is null and graded_at is null
  );

-- -----------------------------------------------------------------------------
-- 4. Kho lưu trữ PRIVATE `homework`: {student_id}/{assignment_id}/{file}
--    Phụ huynh tải bài làm của con; giáo viên tải lời nhắn thoại; ai có quyền với bé thì xem được.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework', 'homework', false, 52428800, array['image/*', 'video/*', 'audio/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "homework_read" on storage.objects;
create policy "homework_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'homework'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

drop policy if exists "homework_insert" on storage.objects;
create policy "homework_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'homework'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

drop policy if exists "homework_delete" on storage.objects;
create policy "homework_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'homework'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Thông báo cho phụ huynh
-- -----------------------------------------------------------------------------
create or replace function public.homework_assigned_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id, public.given_name(s.full_name) as name
    from public.students s
    where s.campus = new.campus and s.class_name = new.class_name and s.parent_id is not null
  loop
    perform public.notify_parent(
      r.id,
      'homework_assigned'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      format('Bài tập mới cho bé %s: %s', r.name, new.title),
      case when new.due_date is not null then format('Hạn nộp %s. ', to_char(new.due_date, 'DD/MM')) else '' end
        || 'Ba mẹ vào mục "Bài tập" để xem và nộp bài cho con nhé.'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists homework_assigned_notify on public.homework_assignments;
create trigger homework_assigned_notify
  after insert on public.homework_assignments
  for each row execute function public.homework_assigned_notify();

create or replace function public.homework_graded_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_title text;
  v_body  text;
begin
  if new.status <> 'graded' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'graded'
     and new.stars is not distinct from old.stars
     and new.teacher_comment is not distinct from old.teacher_comment
     and new.voice_path is not distinct from old.voice_path
     and new.hearted is not distinct from old.hearted then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  select a.title into v_title from public.homework_assignments a where a.id = new.assignment_id;

  v_body := concat_ws(' ',
    case when new.stars is not null then repeat('⭐', new.stars) || format(' Bé nhận %s sao.', new.stars) end,
    case when new.hearted then '❤️ Cô thả tim cho bài làm.' end,
    case when new.voice_path is not null then '🎙️ Có lời nhắn thoại của cô.' end,
    nullif(left(trim(coalesce(new.teacher_comment, '')), 120), '')
  );

  perform public.notify_parent(
    new.student_id,
    'homework_graded'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    format('Cô đã chấm bài "%s" của bé %s', coalesce(v_title, ''), coalesce(v_name, '')),
    coalesce(v_body, '')
  );
  return new;
end;
$$;

drop trigger if exists homework_graded_notify on public.homework_submissions;
create trigger homework_graded_notify
  after update of status, stars, teacher_comment, voice_path, hearted on public.homework_submissions
  for each row execute function public.homework_graded_notify();

-- -----------------------------------------------------------------------------
-- 6. Bảng xếp hạng "Ngôi sao chăm chỉ" theo tuần của 1 lớp
--    Phụ huynh trong lớp xem được (chỉ TÊN GỌI của các bạn + bé nhà mình được đánh dấu);
--    giáo viên phụ trách / quản trị xem họ tên đầy đủ. Không lộ bài làm của bạn khác.
-- -----------------------------------------------------------------------------
create or replace function public.homework_star_leaderboard(p_campus public.campus, p_class text, p_from date, p_to date)
returns table (student_id uuid, display_name text, stars bigint, graded_count bigint, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_staff  boolean := (select public.is_admin()) or public.teacher_manages(p_campus, p_class);
  v_parent boolean := exists (
    select 1 from public.students s
    where s.parent_id = (select auth.uid()) and s.campus = p_campus and s.class_name = p_class
  );
begin
  if not (v_staff or v_parent) then
    return;
  end if;

  return query
    select
      case when v_staff or st.parent_id = (select auth.uid()) then st.id end,
      case when v_staff then st.full_name else public.given_name(st.full_name) end,
      coalesce(sum(sub.stars), 0)::bigint,
      count(sub.id)::bigint,
      st.parent_id is not distinct from (select auth.uid())
    from public.students st
    left join public.homework_submissions sub
      on sub.student_id = st.id
     and sub.status = 'graded'
     and (sub.graded_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    where st.campus = p_campus and st.class_name = p_class
    group by st.id, st.full_name, st.parent_id
    order by 3 desc, 4 desc, 2;
end;
$$;

revoke execute on function public.homework_star_leaderboard(public.campus, text, date, date) from public, anon;
grant execute on function public.homework_star_leaderboard(public.campus, text, date, date) to authenticated;

-- >>> supabase/migrations/20261030000000_admin_center.sql
-- =============================================================================
-- Điều hành trung tâm (khu Quản trị):
--   1. Thông báo nhận thêm `ref_id` → nhiều thông báo cùng loại trong 1 ngày không đè nhau
--      (vd. 2 bài tập / 2 thông báo chung cùng ngày). Hàm mới notify_parent_ref(...).
--   2. Học phí: kỳ thu (`period` = ngày đầu tháng, chống tạo trùng khi "Tạo học phí tháng"),
--      học phí mặc định từng lớp (`classes.monthly_fee`), nhật ký thu tiền `fee_payments`
--      (biết số tiền đã thu TRONG THÁNG), báo phụ huynh khi phát hành khoản thu.
--   3. Thông báo chung của trung tâm `announcements`: toàn bộ phụ huynh / theo cơ sở / theo lớp.
-- Cần đã chạy: notifications, classes, (khuyến nghị) homework. Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch → không dùng trực tiếp giá trị enum mới
-- (lỗi 55P04); các hàm dùng phép ép kiểu từ text khi chạy.
-- =============================================================================

alter type public.notification_type add value if not exists 'announcement';
alter type public.notification_type add value if not exists 'fee_issued';

-- -----------------------------------------------------------------------------
-- 1. Thông báo: thêm ref_id, chống trùng theo (người nhận, bé, loại, ngày, ref_id)
-- -----------------------------------------------------------------------------
alter table public.notifications add column if not exists ref_id uuid;

alter table public.notifications drop constraint if exists notifications_dedupe;
drop index if exists public.notifications_dedupe_ref;
create unique index notifications_dedupe_ref
  on public.notifications (recipient_id, student_id, type, ref_date, ref_id) nulls not distinct;
create index if not exists notifications_ref_idx on public.notifications (ref_id) where ref_id is not null;

create or replace function public.notify_parent_ref(
  p_student_id uuid,
  p_type       public.notification_type,
  p_ref_date   date,
  p_ref_id     uuid,
  p_title      text,
  p_body       text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent uuid;
begin
  select s.parent_id into v_parent from public.students s where s.id = p_student_id;
  if v_parent is null then
    return; -- học sinh chưa gắn tài khoản phụ huynh
  end if;

  insert into public.notifications as n (recipient_id, student_id, type, ref_date, ref_id, title, body)
  values (v_parent, p_student_id, p_type, p_ref_date, p_ref_id, p_title, coalesce(p_body, ''))
  on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
    set title      = excluded.title,
        body       = excluded.body,
        read_at    = null,
        created_at = now();
end;
$$;

-- Hàm cũ (điểm danh, sổ liên lạc, phản hồi, tổng kết tháng) = ref_id null
create or replace function public.notify_parent(
  p_student_id uuid,
  p_type       public.notification_type,
  p_ref_date   date,
  p_title      text,
  p_body       text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.notify_parent_ref(p_student_id, p_type, p_ref_date, null, p_title, p_body);
end;
$$;

revoke execute on function public.notify_parent_ref(uuid, public.notification_type, date, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_parent(uuid, public.notification_type, date, text, text) from public, anon, authenticated;

-- Bài tập: mỗi bài / mỗi lần chấm là 1 thông báo riêng (trước đây 2 bài cùng ngày đè nhau)
create or replace function public.homework_assigned_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id, public.given_name(s.full_name) as name
    from public.students s
    where s.campus = new.campus and s.class_name = new.class_name and s.parent_id is not null
  loop
    perform public.notify_parent_ref(
      r.id,
      'homework_assigned'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      new.id,
      format('Bài tập mới cho bé %s: %s', r.name, new.title),
      case when new.due_date is not null then format('Hạn nộp %s. ', to_char(new.due_date, 'DD/MM')) else '' end
        || 'Ba mẹ vào mục "Bài tập" để xem và nộp bài cho con nhé.'
    );
  end loop;
  return new;
end;
$$;

create or replace function public.homework_graded_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_title text;
  v_body  text;
begin
  if new.status <> 'graded' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'graded'
     and new.stars is not distinct from old.stars
     and new.teacher_comment is not distinct from old.teacher_comment
     and new.voice_path is not distinct from old.voice_path
     and new.hearted is not distinct from old.hearted then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  select a.title into v_title from public.homework_assignments a where a.id = new.assignment_id;

  v_body := concat_ws(' ',
    case when new.stars is not null then repeat('⭐', new.stars) || format(' Bé nhận %s sao.', new.stars) end,
    case when new.hearted then '❤️ Cô thả tim cho bài làm.' end,
    case when new.voice_path is not null then '🎙️ Có lời nhắn thoại của cô.' end,
    nullif(left(trim(coalesce(new.teacher_comment, '')), 120), '')
  );

  perform public.notify_parent_ref(
    new.student_id,
    'homework_graded'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    new.id,
    format('Cô đã chấm bài "%s" của bé %s', coalesce(v_title, ''), coalesce(v_name, '')),
    coalesce(v_body, '')
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Học phí
-- -----------------------------------------------------------------------------
alter table public.classes add column if not exists monthly_fee numeric(12, 0);
alter table public.classes drop constraint if exists classes_monthly_fee_positive;
alter table public.classes add constraint classes_monthly_fee_positive check (monthly_fee is null or monthly_fee >= 0);

-- Kỳ thu: ngày đầu tháng. Mỗi bé chỉ 1 khoản / kỳ (khoản lẻ không có kỳ thì không giới hạn — NULL khác nhau)
alter table public.fees add column if not exists period date;
alter table public.fees drop constraint if exists fees_period_month_start;
alter table public.fees add constraint fees_period_month_start check (period is null or extract(day from period) = 1);
create unique index if not exists fees_student_period_uidx on public.fees (student_id, period);
create index if not exists fees_period_idx on public.fees (period) where period is not null;

-- Nhật ký thu tiền: mỗi lần số tiền đã đóng thay đổi → 1 dòng (chênh lệch, có thể âm khi sửa sai)
create table if not exists public.fee_payments (
  id          uuid primary key default gen_random_uuid(),
  fee_id      uuid not null references public.fees (id) on delete cascade,
  amount      numeric(12, 0) not null,
  paid_at     timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null
);
create index if not exists fee_payments_paid_at_idx on public.fee_payments (paid_at);
create index if not exists fee_payments_fee_idx on public.fee_payments (fee_id);

alter table public.fee_payments enable row level security;
revoke all on public.fee_payments from anon;
drop policy if exists "admin_all_fee_payments" on public.fee_payments;
create policy "admin_all_fee_payments" on public.fee_payments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.fees_log_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_delta numeric;
begin
  v_delta := new.paid_amount - case when tg_op = 'UPDATE' then old.paid_amount else 0 end;
  if v_delta <> 0 then
    insert into public.fee_payments (fee_id, amount, recorded_by) values (new.id, v_delta, (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists fees_log_payment on public.fees;
create trigger fees_log_payment
  after insert or update of paid_amount on public.fees
  for each row execute function public.fees_log_payment();

-- Dữ liệu cũ: ghi nhận số đã đóng tại thời điểm tạo khoản thu (chỉ 1 lần)
insert into public.fee_payments (fee_id, amount, paid_at)
select f.id, f.paid_amount, f.created_at
from public.fees f
where f.paid_amount > 0
  and not exists (select 1 from public.fee_payments p where p.fee_id = f.id);

-- Phát hành khoản thu → báo phụ huynh
create or replace function public.fees_issued_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  perform public.notify_parent_ref(
    new.student_id,
    'fee_issued'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    new.id,
    format('Thông báo học phí của bé %s: %s', coalesce(v_name, ''), new.title),
    format('Số tiền %s đ', to_char(new.amount, 'FM999G999G999G999'))
      || case when new.due_date is not null then format(', hạn đóng %s', to_char(new.due_date, 'DD/MM/YYYY')) else '' end
      || '. Ba mẹ xem chi tiết ở mục "Học phí".'
  );
  return new;
end;
$$;

drop trigger if exists fees_issued_notify on public.fees;
create trigger fees_issued_notify
  after insert on public.fees
  for each row execute function public.fees_issued_notify();

-- Xoá khoản thu → xoá thông báo của khoản đó
create or replace function public.fees_deleted_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n where n.ref_id = old.id and n.type::text = 'fee_issued';
  return old;
end;
$$;

drop trigger if exists fees_deleted_cleanup on public.fees;
create trigger fees_deleted_cleanup
  after delete on public.fees
  for each row execute function public.fees_deleted_cleanup();

-- -----------------------------------------------------------------------------
-- 3. Thông báo chung của trung tâm
-- -----------------------------------------------------------------------------
create table if not exists public.announcements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  body             text not null,
  category         text not null default 'general',
  audience         text not null default 'all',
  campus           public.campus,
  class_ids        uuid[] not null default '{}',
  recipient_count  integer not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint announcements_title_length check (length(trim(title)) between 3 and 150),
  constraint announcements_body_length check (length(trim(body)) between 1 and 5000),
  constraint announcements_category_valid check (category in ('general', 'holiday', 'contest', 'extracurricular')),
  constraint announcements_audience_valid check (audience in ('all', 'campus', 'classes')),
  constraint announcements_audience_target check (
    (audience = 'all')
    or (audience = 'campus' and campus is not null)
    or (audience = 'classes' and cardinality(class_ids) between 1 and 200)
  )
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon;

drop policy if exists "admin_all_announcements" on public.announcements;
create policy "admin_all_announcements" on public.announcements
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Phụ huynh xem thông báo gửi tới mình (theo lớp / cơ sở của con)
drop policy if exists "announcements_parent_select" on public.announcements;
create policy "announcements_parent_select" on public.announcements
  for select to authenticated
  using (exists (
    select 1
    from public.students s
    left join public.classes c on c.campus = s.campus and c.name = s.class_name
    where s.parent_id = (select auth.uid())
      and (
        announcements.audience = 'all'
        or (announcements.audience = 'campus' and s.campus = announcements.campus)
        or (announcements.audience = 'classes' and c.id = any (announcements.class_ids))
      )
  ));

-- Học sinh (mỗi phụ huynh 1 bé đại diện) thuộc đối tượng nhận của thông báo
create or replace function public.announcement_recipients(p_audience text, p_campus public.campus, p_class_ids uuid[])
returns table (student_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct on (s.parent_id) s.id
  from public.students s
  left join public.classes c on c.campus = s.campus and c.name = s.class_name
  where s.parent_id is not null
    and (
      p_audience = 'all'
      or (p_audience = 'campus' and s.campus = p_campus)
      or (p_audience = 'classes' and c.id = any (p_class_ids))
    )
  order by s.parent_id, s.created_at;
$$;
revoke execute on function public.announcement_recipients(text, public.campus, uuid[]) from public, anon, authenticated;

create or replace function public.announcement_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r       record;
  v_count integer := 0;
  v_body  text;
begin
  v_body := left(regexp_replace(trim(new.body), '\s+', ' ', 'g'), 180)
    || case when length(trim(new.body)) > 180 then '…' else '' end;
  for r in select * from public.announcement_recipients(new.audience, new.campus, new.class_ids) loop
    perform public.notify_parent_ref(
      r.student_id,
      'announcement'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      new.id,
      new.title,
      v_body
    );
    v_count := v_count + 1;
  end loop;
  update public.announcements set recipient_count = v_count where id = new.id;
  return new;
end;
$$;

drop trigger if exists announcement_notify on public.announcements;
create trigger announcement_notify
  after insert on public.announcements
  for each row execute function public.announcement_notify();

create or replace function public.announcement_deleted_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n where n.ref_id = old.id and n.type::text = 'announcement';
  return old;
end;
$$;

drop trigger if exists announcement_deleted_cleanup on public.announcements;
create trigger announcement_deleted_cleanup
  after delete on public.announcements
  for each row execute function public.announcement_deleted_cleanup();

-- >>> supabase/migrations/20261031000000_leave_chat_push.sql
-- =============================================================================
-- Tương tác realtime:
--   1. Đơn xin nghỉ học: phụ huynh gửi → giáo viên phụ trách nhận thông báo realtime → "Đồng ý"
--      → điểm danh các ngày đó tự thành `absent_with_permission` (Nghỉ có phép).
--   2. Kênh chat phụ huynh ↔ giáo viên phụ trách lớp của con (văn bản, ảnh, emoji) qua Supabase Realtime.
--   3. Web Push: bảng đăng ký thiết bị + cột notifications.pushed_at (server gửi push rồi đánh dấu).
-- Cần đã chạy: notifications, admin-center (notify_parent_ref). Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch → không dùng trực tiếp giá trị enum mới
-- (lỗi 55P04); các hàm dùng phép ép kiểu từ text khi chạy.
-- =============================================================================

alter type public.attendance_status add value if not exists 'absent_with_permission';
alter type public.notification_type add value if not exists 'leave_request';
alter type public.notification_type add value if not exists 'leave_decided';

-- -----------------------------------------------------------------------------
-- 0. Thông báo: đánh dấu đã gửi push (thông báo được làm mới → gửi lại)
-- -----------------------------------------------------------------------------
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_pending_idx on public.notifications (created_at) where pushed_at is null;

create or replace function public.notify_parent_ref(
  p_student_id uuid,
  p_type       public.notification_type,
  p_ref_date   date,
  p_ref_id     uuid,
  p_title      text,
  p_body       text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent uuid;
begin
  select s.parent_id into v_parent from public.students s where s.id = p_student_id;
  if v_parent is null then
    return; -- học sinh chưa gắn tài khoản phụ huynh
  end if;

  insert into public.notifications as n (recipient_id, student_id, type, ref_date, ref_id, title, body)
  values (v_parent, p_student_id, p_type, p_ref_date, p_ref_id, p_title, coalesce(p_body, ''))
  on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
    set title      = excluded.title,
        body       = excluded.body,
        read_at    = null,
        pushed_at  = null,
        created_at = now();
end;
$$;
revoke execute on function public.notify_parent_ref(uuid, public.notification_type, date, uuid, text, text) from public, anon, authenticated;

-- Điểm danh: thêm nhãn "Nghỉ có phép"; duyệt đơn nghỉ tự ghi điểm danh thì KHÔNG gửi thêm thông báo từng ngày
create or replace function public.attendance_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_label text;
begin
  if coalesce(current_setting('thedu.skip_attendance_notify', true), '') = 'on' then
    return new;
  end if;
  -- Lưu lại cả lớp nhưng trạng thái/ghi chú của bé không đổi → không làm phiền phụ huynh
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.note is not distinct from old.note then
    return new;
  end if;

  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  v_label := case new.status::text
    when 'present' then 'Có mặt'
    when 'late'    then 'Đi muộn'
    when 'absent'  then 'Nghỉ học'
    when 'absent_with_permission' then 'Nghỉ có phép'
  end;

  perform public.notify_parent(
    new.student_id,
    'attendance',
    new.date,
    format('Bé %s: %s', coalesce(v_name, ''), v_label),
    case
      when nullif(trim(new.note), '') is not null then format('Ghi chú của giáo viên: %s', trim(new.note))
      when new.status::text = 'present' then 'Con đã đến lớp an toàn.'
      when new.status::text = 'late'    then 'Con đã đến lớp (muộn).'
      when new.status::text = 'absent_with_permission' then 'Nhà trường đã ghi nhận con nghỉ có phép.'
      else 'Nhà trường đã ghi nhận con nghỉ học.'
    end
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Đơn xin nghỉ học
-- -----------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students (id) on delete cascade,
  parent_id      uuid references public.profiles (id) on delete set null,
  start_date     date not null,
  end_date       date not null,
  reason         text not null default 'sick',
  note           text,
  status         text not null default 'pending',
  decided_by     uuid references public.profiles (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date and end_date - start_date <= 30),
  constraint leave_requests_reason_valid check (reason in ('sick', 'family', 'travel', 'other')),
  constraint leave_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint leave_requests_note_length check (note is null or length(note) <= 500),
  constraint leave_requests_decision_note_length check (decision_note is null or length(decision_note) <= 300)
);
create index if not exists leave_requests_student_idx on public.leave_requests (student_id, start_date desc);
create index if not exists leave_requests_pending_idx on public.leave_requests (created_at) where status = 'pending';

drop trigger if exists leave_requests_touch on public.leave_requests;
create trigger leave_requests_touch
  before update on public.leave_requests
  for each row execute function public.touch_updated_at();

alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon;

drop policy if exists "admin_all_leave_requests" on public.leave_requests;
create policy "admin_all_leave_requests" on public.leave_requests
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "leave_requests_parent_select" on public.leave_requests;
create policy "leave_requests_parent_select" on public.leave_requests
  for select to authenticated using (public.is_parent_of(student_id));

-- Gửi đơn: chỉ cho con mình, ngày nghỉ không quá 7 ngày trước hôm nay (ốm hôm qua vẫn báo được)
drop policy if exists "leave_requests_parent_insert" on public.leave_requests;
create policy "leave_requests_parent_insert" on public.leave_requests
  for insert to authenticated
  with check (
    public.is_parent_of(student_id)
    and parent_id = (select auth.uid())
    and status = 'pending' and decided_by is null and decided_at is null and decision_note is null
    and start_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 7
  );

-- Phụ huynh chỉ sửa / huỷ đơn đang chờ
drop policy if exists "leave_requests_parent_update" on public.leave_requests;
create policy "leave_requests_parent_update" on public.leave_requests
  for update to authenticated
  using (public.is_parent_of(student_id) and status = 'pending')
  with check (public.is_parent_of(student_id) and status in ('pending', 'cancelled') and decided_by is null);

drop policy if exists "leave_requests_teacher_select" on public.leave_requests;
create policy "leave_requests_teacher_select" on public.leave_requests
  for select to authenticated using (public.teacher_can_access_student(student_id));

drop policy if exists "leave_requests_teacher_update" on public.leave_requests;
create policy "leave_requests_teacher_update" on public.leave_requests
  for update to authenticated
  using (public.teacher_can_access_student(student_id))
  with check (public.teacher_can_access_student(student_id));

-- Chặn sửa sai vai trò: giáo viên/quản trị chỉ đổi trạng thái + ghi chú duyệt; phụ huynh không tự duyệt
create or replace function public.leave_requests_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_staff boolean;
begin
  if v_uid is null then
    return new; -- service role / SQL editor
  end if;
  v_staff := public.is_admin() or public.teacher_can_access_student(old.student_id);

  if v_staff and not public.is_parent_of(old.student_id) then
    if new.student_id <> old.student_id or new.start_date <> old.start_date or new.end_date <> old.end_date
       or new.reason <> old.reason or new.note is distinct from old.note or new.parent_id is distinct from old.parent_id then
      raise exception 'Giáo viên chỉ được duyệt / từ chối đơn' using errcode = '42501';
    end if;
    if new.status = 'cancelled' then
      raise exception 'Chỉ phụ huynh được huỷ đơn' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      new.decided_by := v_uid;
      new.decided_at := now();
    end if;
  else
    if new.decided_by is distinct from old.decided_by or new.decision_note is distinct from old.decision_note
       or new.status not in ('pending', 'cancelled') or new.student_id <> old.student_id then
      raise exception 'Không có quyền duyệt đơn' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_guard on public.leave_requests;
create trigger leave_requests_guard
  before update on public.leave_requests
  for each row execute function public.leave_requests_guard();

create or replace function public.leave_reason_label(p_reason text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_reason
    when 'sick'   then 'Bị ốm'
    when 'family' then 'Việc gia đình'
    when 'travel' then 'Đi xa / du lịch'
    else 'Lý do khác'
  end;
$$;

-- Đơn mới → báo giáo viên phụ trách lớp (riêng lớp hoặc toàn cơ sở)
create or replace function public.leave_request_notify_teachers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_student record;
  v_range   text;
begin
  select s.full_name, s.campus, s.class_name into v_student from public.students s where s.id = new.student_id;
  v_range := case when new.start_date = new.end_date then to_char(new.start_date, 'DD/MM')
                  else to_char(new.start_date, 'DD/MM') || ' – ' || to_char(new.end_date, 'DD/MM') end;

  insert into public.notifications (recipient_id, student_id, type, ref_date, ref_id, title, body)
  select distinct ta.teacher_id, new.student_id, 'leave_request'::text::public.notification_type,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.id,
         format('Đơn xin nghỉ: %s (lớp %s)', v_student.full_name, v_student.class_name),
         format('Nghỉ %s · %s', v_range, public.leave_reason_label(new.reason))
           || case when nullif(trim(new.note), '') is not null then ' · ' || left(trim(new.note), 120) else '' end
  from public.teacher_assignments ta
  join public.profiles p on p.id = ta.teacher_id and p.role = 'teacher'
  where ta.campus = v_student.campus and (ta.class_name is null or ta.class_name = v_student.class_name)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists leave_request_notify_teachers on public.leave_requests;
create trigger leave_request_notify_teachers
  after insert on public.leave_requests
  for each row execute function public.leave_request_notify_teachers();

-- Duyệt đơn → ghi "Nghỉ có phép" vào điểm danh từng ngày học (bỏ Chủ nhật) + báo phụ huynh.
-- Huỷ duyệt (đã đồng ý → từ chối) → gỡ các dòng điểm danh do đơn tạo ra.
create or replace function public.leave_request_decided()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_range text;
  v_day   date;
  v_note  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_note := 'Nghỉ có phép: ' || public.leave_reason_label(new.reason);

  if new.status = 'approved' then
    perform set_config('thedu.skip_attendance_notify', 'on', true);
    for v_day in select d::date from generate_series(new.start_date, new.end_date, interval '1 day') d loop
      continue when extract(isodow from v_day) = 7; -- Chủ nhật không học
      insert into public.attendance (student_id, date, status, note)
      values (new.student_id, v_day, 'absent_with_permission'::text::public.attendance_status, v_note)
      on conflict (student_id, date) do update set status = excluded.status, note = excluded.note;
    end loop;
    perform set_config('thedu.skip_attendance_notify', 'off', true);
  elsif old.status = 'approved' then
    delete from public.attendance a
    where a.student_id = new.student_id and a.date between new.start_date and new.end_date
      and a.status::text = 'absent_with_permission' and a.note = v_note;
  end if;

  -- Thông báo của giáo viên về đơn này coi như đã xử lý
  if new.status <> 'pending' then
    update public.notifications n set read_at = coalesce(n.read_at, now())
    where n.ref_id = new.id and n.type::text = 'leave_request';
  end if;

  if new.status in ('approved', 'rejected') then
    select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
    v_range := case when new.start_date = new.end_date then to_char(new.start_date, 'DD/MM')
                    else to_char(new.start_date, 'DD/MM') || ' – ' || to_char(new.end_date, 'DD/MM') end;
    perform public.notify_parent_ref(
      new.student_id,
      'leave_decided'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      new.id,
      case when new.status = 'approved'
        then format('Cô đã đồng ý đơn xin nghỉ của bé %s', coalesce(v_name, ''))
        else format('Đơn xin nghỉ của bé %s chưa được đồng ý', coalesce(v_name, '')) end,
      format('Ngày nghỉ: %s.', v_range)
        || case when new.status = 'approved' then ' Đã ghi nhận nghỉ có phép.' else '' end
        || case when nullif(trim(new.decision_note), '') is not null then ' Cô nhắn: ' || trim(new.decision_note) else '' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists leave_request_decided on public.leave_requests;
create trigger leave_request_decided
  after update of status on public.leave_requests
  for each row execute function public.leave_request_decided();

-- -----------------------------------------------------------------------------
-- 2. Chat phụ huynh ↔ giáo viên phụ trách lớp của con
-- -----------------------------------------------------------------------------
-- Được chat khi giáo viên phụ trách RIÊNG lớp của một bé; lớp chưa có giáo viên riêng → giáo viên phụ trách cả cơ sở.
create or replace function public.chat_allowed(p_parent uuid, p_teacher uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_assignments ta on ta.teacher_id = p_teacher and ta.campus = s.campus
    join public.profiles t on t.id = ta.teacher_id and t.role = 'teacher'
    where s.parent_id = p_parent
      and (
        ta.class_name = s.class_name
        or (ta.class_name is null and not exists (
          select 1 from public.teacher_assignments x where x.campus = s.campus and x.class_name = s.class_name
        ))
      )
  );
$$;

create table if not exists public.chat_conversations (
  id                    uuid primary key default gen_random_uuid(),
  parent_id             uuid not null references public.profiles (id) on delete cascade,
  teacher_id            uuid not null references public.profiles (id) on delete cascade,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender_id        uuid,
  parent_last_read_at   timestamptz,
  teacher_last_read_at  timestamptz,
  constraint chat_conversations_pair unique (parent_id, teacher_id),
  constraint chat_conversations_distinct check (parent_id <> teacher_id)
);
create index if not exists chat_conversations_teacher_idx on public.chat_conversations (teacher_id, last_message_at desc);
create index if not exists chat_conversations_parent_idx on public.chat_conversations (parent_id, last_message_at desc);

create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body             text,
  image_path       text,
  created_at       timestamptz not null default now(),
  constraint chat_messages_content check (nullif(trim(body), '') is not null or image_path is not null),
  constraint chat_messages_body_length check (body is null or length(body) <= 2000),
  constraint chat_messages_image_path check (image_path is null or image_path like conversation_id::text || '/%')
);
create index if not exists chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at desc);

create or replace function public.chat_is_participant(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_conversations c
    where c.id = p_conversation and (select auth.uid()) in (c.parent_id, c.teacher_id)
  );
$$;

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations, public.chat_messages from anon;

drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select" on public.chat_conversations
  for select to authenticated
  using ((select auth.uid()) in (parent_id, teacher_id) or (select public.is_admin()));

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert" on public.chat_conversations
  for insert to authenticated
  with check ((select auth.uid()) in (parent_id, teacher_id) and public.chat_allowed(parent_id, teacher_id));

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (public.chat_is_participant(conversation_id) or (select public.is_admin()));

-- Gửi tin: đúng người gửi + vẫn còn quyền chat (bé chuyển lớp → giáo viên cũ không nhắn tiếp được)
drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.parent_id, c.teacher_id)
        and public.chat_allowed(c.parent_id, c.teacher_id)
    )
  );

create or replace function public.chat_message_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.chat_conversations c
  set last_message_at      = new.created_at,
      last_message_preview = case when nullif(trim(new.body), '') is not null then left(trim(new.body), 120) else '📷 Hình ảnh' end,
      last_sender_id       = new.sender_id,
      parent_last_read_at  = case when new.sender_id = c.parent_id then new.created_at else c.parent_last_read_at end,
      teacher_last_read_at = case when new.sender_id = c.teacher_id then new.created_at else c.teacher_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_message_after_insert on public.chat_messages;
create trigger chat_message_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_message_after_insert();

-- Đánh dấu đã đọc (chỉ mốc của chính mình)
create or replace function public.chat_mark_read(p_conversation uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.chat_conversations c
  set parent_last_read_at  = case when c.parent_id = (select auth.uid()) then now() else c.parent_last_read_at end,
      teacher_last_read_at = case when c.teacher_id = (select auth.uid()) then now() else c.teacher_last_read_at end
  where c.id = p_conversation and (select auth.uid()) in (c.parent_id, c.teacher_id);
$$;
revoke execute on function public.chat_mark_read(uuid) from public, anon;
grant execute on function public.chat_mark_read(uuid) to authenticated;

-- Danh bạ chat của người dùng hiện tại: phụ huynh → giáo viên phụ trách lớp con; giáo viên → phụ huynh lớp mình
create or replace function public.chat_contacts()
returns table (contact_id uuid, full_name text, role text, children text[], classes text[])
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select t.id, t.full_name, 'teacher', array_agg(distinct s.full_name), array_agg(distinct s.class_name)
  from me
  join public.students s on s.parent_id = me.uid
  join public.teacher_assignments ta on ta.campus = s.campus
  join public.profiles t on t.id = ta.teacher_id and t.role = 'teacher'
  where public.chat_allowed(me.uid, t.id)
    and (ta.class_name = s.class_name or ta.class_name is null)
  group by t.id, t.full_name
  union all
  select p.id, p.full_name, 'parent', array_agg(distinct s.full_name), array_agg(distinct s.class_name)
  from me
  join public.teacher_assignments ta on ta.teacher_id = me.uid
  join public.students s on s.campus = ta.campus and (ta.class_name is null or ta.class_name = s.class_name)
  join public.profiles p on p.id = s.parent_id
  where public.chat_allowed(p.id, me.uid)
  group by p.id, p.full_name;
$$;
revoke execute on function public.chat_contacts() from public, anon;
grant execute on function public.chat_contacts() to authenticated;

-- Ảnh trong chat: kho PRIVATE `chat`, {conversation_id}/{file}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_read" on storage.objects;
create policy "chat_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat' and (public.chat_is_participant(public.safe_uuid((storage.foldername(name))[1])) or (select public.is_admin())));

drop policy if exists "chat_insert" on storage.objects;
create policy "chat_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat' and public.chat_is_participant(public.safe_uuid((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- 3. Web Push: thiết bị đã bật thông báo
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. Realtime (Realtime tôn trọng RLS)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['leave_requests', 'chat_messages', 'chat_conversations'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- >>> supabase/migrations/20261101000000_push_autodispatch.sql
-- =============================================================================
-- Tự động đẩy thông báo (Web Push / Zalo ZNS) cho MỌI thông báo mới — kể cả thông báo sinh ngoài app
-- (sửa trực tiếp trong SQL, trigger khác…), không cần tạo Database Webhook bằng tay.
--
-- Cơ chế: trigger mức câu lệnh trên `notifications` gọi pg_net (HTTP bất đồng bộ, không làm chậm giao dịch)
-- tới `<APP_URL>/api/push/dispatch` với `Authorization: Bearer <PUSH_DISPATCH_SECRET>`.
-- URL + mã bí mật lưu ở bảng `app_settings` (chỉ quản trị đọc/ghi) — bấm "Kết nối tự động" ở /admin/notifications-settings.
-- Chưa cấu hình → trigger không làm gì. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon;
drop policy if exists "admin_all_app_settings" on public.app_settings;
create policy "admin_all_app_settings" on public.app_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Một lần gọi cho mỗi câu lệnh (tạo học phí cho 200 bé = 1 lần gọi). Bỏ qua khi server tự đánh dấu pushed_at (tránh vòng lặp).
create or replace function public.notifications_autodispatch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from new_rows where pushed_at is null) then
    return null;
  end if;

  select value into v_url from public.app_settings where key = 'push_dispatch_url';
  select value into v_secret from public.app_settings where key = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      timeout_milliseconds := 10000
    );
  exception when others then
    -- Không bao giờ làm hỏng việc lưu điểm danh / sổ liên lạc vì lỗi gọi HTTP
    raise warning 'notifications_autodispatch: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifications_autodispatch_insert on public.notifications;
create trigger notifications_autodispatch_insert
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_autodispatch();

drop trigger if exists notifications_autodispatch_update on public.notifications;
create trigger notifications_autodispatch_update
  after update on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_autodispatch();

-- >>> supabase/migrations/20261102000000_chat_moderation.sql
-- =============================================================================
-- Quản trị kênh chat phụ huynh ↔ giáo viên:
--   - Quản trị viên xem mọi cuộc trò chuyện (đã có từ policy chat_*_select) và GỠ tin nhắn không phù hợp.
--   - Gỡ = xoá nội dung + ảnh, giữ dấu vết (removed_at/removed_by) → hai bên thấy "Tin nhắn đã bị quản trị viên gỡ".
-- Cần đã chạy: apply-leave-chat-push.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

alter table public.chat_messages add column if not exists removed_at timestamptz;
alter table public.chat_messages add column if not exists removed_by uuid references public.profiles (id) on delete set null;

-- Tin đã gỡ không còn nội dung
alter table public.chat_messages drop constraint if exists chat_messages_content;
alter table public.chat_messages add constraint chat_messages_content
  check (removed_at is not null or nullif(trim(body), '') is not null or image_path is not null);

-- Chỉ quản trị viên được gỡ (cập nhật) tin nhắn; người trong cuộc không sửa được tin đã gửi
drop policy if exists "chat_messages_admin_update" on public.chat_messages;
create policy "chat_messages_admin_update" on public.chat_messages
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Gỡ tin cuối cùng → cập nhật dòng xem trước của cuộc trò chuyện
create or replace function public.chat_message_after_remove()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    update public.chat_conversations c
    set last_message_preview = '🚫 Tin nhắn đã bị gỡ'
    where c.id = new.conversation_id and c.last_message_at = new.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_after_remove on public.chat_messages;
create trigger chat_message_after_remove
  after update of removed_at on public.chat_messages
  for each row execute function public.chat_message_after_remove();

-- Quản trị viên xoá được ảnh của tin bị gỡ
drop policy if exists "chat_admin_delete" on storage.objects;
create policy "chat_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat' and (select public.is_admin()));

-- >>> supabase/migrations/20261103000000_admin_chat_reply.sql
-- =============================================================================
-- Quản trị viên trả lời trong cuộc trò chuyện phụ huynh ↔ giáo viên (tin hiện là "Trung tâm TH EDU" ở cả hai phía).
-- Cần đã chạy: apply-leave-chat-push.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

-- Gửi tin: quản trị viên gửi vào mọi cuộc trò chuyện (đứng tên chính mình)
drop policy if exists "chat_messages_admin_insert" on public.chat_messages;
create policy "chat_messages_admin_insert" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_admin())
    and exists (select 1 from public.chat_conversations c where c.id = conversation_id)
  );

-- Ảnh quản trị viên gửi trong chat: {conversation_id}/{file}
drop policy if exists "chat_admin_insert" on storage.objects;
create policy "chat_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat'
    and (select public.is_admin())
    and exists (select 1 from public.chat_conversations c where c.id = public.safe_uuid((storage.foldername(name))[1]))
  );

-- >>> supabase/migrations/20261104000000_admin_activity_feed.sql
-- =============================================================================
-- Thông báo cho QUẢN TRỊ VIÊN: mọi hoạt động của phụ huynh & giáo viên trong một bảng tin chung.
--   Phụ huynh: gửi phản hồi, gửi / huỷ đơn xin nghỉ, nộp bài tập, nhắn tin.
--   Giáo viên: điểm danh, viết sổ liên lạc, giao / chấm bài tập, xử lý đơn nghỉ, gửi tổng kết tháng, nhắn tin.
-- Hoạt động lặp lại được GỘP (cùng nhóm trong 30 phút → cập nhật 1 dòng, tăng bộ đếm) để không ngập thông báo.
-- Mỗi quản trị viên có mốc "đã xem" riêng (admin_notification_state). Realtime → chuông trên header cập nhật ngay.
-- Trigger chỉ GHI THÊM, lỗi (nếu có) không làm hỏng thao tác gốc. Chạy lại nhiều lần vẫn an toàn.
-- Cần đã chạy các migration tạo bảng nguồn (feedback, leave_requests, chat, homework, monthly_summaries).
-- =============================================================================

create table if not exists public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_role   text not null,
  actor_name   text not null default '',
  title        text not null,
  body         text not null default '',
  href         text not null default '/admin/dashboard',
  group_key    text,
  event_count  integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint admin_notifications_category_valid
    check (category in ('feedback', 'leave', 'chat', 'homework', 'daily_report', 'attendance', 'summary')),
  constraint admin_notifications_actor_role_valid check (actor_role in ('parent', 'teacher'))
);
create index if not exists admin_notifications_updated_idx on public.admin_notifications (updated_at desc);
create index if not exists admin_notifications_group_idx on public.admin_notifications (group_key, updated_at desc) where group_key is not null;

create table if not exists public.admin_notification_state (
  admin_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at  timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_state enable row level security;
revoke all on public.admin_notifications, public.admin_notification_state from anon;

drop policy if exists "admin_select_admin_notifications" on public.admin_notifications;
create policy "admin_select_admin_notifications" on public.admin_notifications
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin_delete_admin_notifications" on public.admin_notifications;
create policy "admin_delete_admin_notifications" on public.admin_notifications
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "admin_notification_state_own" on public.admin_notification_state;
create policy "admin_notification_state_own" on public.admin_notification_state
  for all to authenticated
  using (admin_id = (select auth.uid()) and (select public.is_admin()))
  with check (admin_id = (select auth.uid()) and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Ghi 1 hoạt động (bỏ qua nếu người làm là quản trị viên / không xác định). p_group: gộp trong 30 phút.
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_push(
  p_category text, p_actor uuid, p_group text, p_title text, p_body text, p_href text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_name text;
  v_id   uuid;
begin
  if p_actor is null then
    return;
  end if;
  select p.role::text, coalesce(p.full_name, '') into v_role, v_name from public.profiles p where p.id = p_actor;
  if v_role is null or v_role not in ('parent', 'teacher') then
    return;
  end if;

  if p_group is not null then
    select n.id into v_id
    from public.admin_notifications n
    where n.group_key = p_group and n.updated_at > now() - interval '30 minutes'
    order by n.updated_at desc
    limit 1;
    if v_id is not null then
      update public.admin_notifications
      set title = p_title, body = coalesce(p_body, ''), href = coalesce(p_href, href),
          event_count = event_count + 1, updated_at = now(), actor_id = p_actor, actor_name = v_name
      where id = v_id;
      return;
    end if;
  end if;

  insert into public.admin_notifications (category, actor_id, actor_role, actor_name, title, body, href, group_key)
  values (p_category, p_actor, v_role, v_name, p_title, coalesce(p_body, ''), coalesce(p_href, '/admin/dashboard'), p_group);
end;
$$;
revoke execute on function public.admin_feed_push(text, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_feed_student_label(p_student uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.full_name || ' (' || s.class_name || ')' from public.students s where s.id = p_student;
$$;
revoke execute on function public.admin_feed_student_label(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Phản hồi của phụ huynh
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_feedback()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.admin_feed_push(
      'feedback', new.parent_id, null,
      'Phản hồi mới từ phụ huynh',
      left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 160),
      '/admin/feedback'
    );
  exception when others then raise warning 'admin_feed_feedback: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_feedback on public.feedback;
create trigger admin_feed_feedback after insert on public.feedback
  for each row execute function public.admin_feed_feedback();

-- -----------------------------------------------------------------------------
-- 2. Đơn xin nghỉ: phụ huynh gửi / huỷ; giáo viên đồng ý / từ chối
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_leave()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_range text := case when new.start_date = new.end_date then to_char(new.start_date, 'DD/MM')
                       else to_char(new.start_date, 'DD/MM') || ' – ' || to_char(new.end_date, 'DD/MM') end;
  v_student text := public.admin_feed_student_label(new.student_id);
begin
  begin
    if tg_op = 'INSERT' then
      perform public.admin_feed_push('leave', new.parent_id, null,
        'Đơn xin nghỉ mới: bé ' || coalesce(v_student, ''),
        'Nghỉ ' || v_range || ' · ' || public.leave_reason_label(new.reason)
          || case when nullif(trim(new.note), '') is not null then ' · ' || left(trim(new.note), 100) else '' end,
        '/admin/leave-requests');
    elsif new.status is distinct from old.status then
      if new.status = 'cancelled' then
        perform public.admin_feed_push('leave', new.parent_id, null,
          'Phụ huynh huỷ đơn xin nghỉ: bé ' || coalesce(v_student, ''), 'Nghỉ ' || v_range, '/admin/leave-requests?view=done');
      elsif new.status in ('approved', 'rejected') then
        perform public.admin_feed_push('leave', (select auth.uid()), null,
          case when new.status = 'approved' then 'Đã đồng ý đơn xin nghỉ: bé ' else 'Từ chối đơn xin nghỉ: bé ' end || coalesce(v_student, ''),
          'Nghỉ ' || v_range || case when nullif(trim(new.decision_note), '') is not null then ' · “' || left(trim(new.decision_note), 100) || '”' else '' end,
          '/admin/leave-requests?view=done');
      end if;
    end if;
  exception when others then raise warning 'admin_feed_leave: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_leave on public.leave_requests;
create trigger admin_feed_leave after insert or update of status on public.leave_requests
  for each row execute function public.admin_feed_leave();

-- -----------------------------------------------------------------------------
-- 3. Tin nhắn phụ huynh ↔ giáo viên (gộp theo cuộc trò chuyện)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent  text;
  v_teacher text;
  v_sender  text;
begin
  begin
    select coalesce(pp.full_name, 'Phụ huynh'), coalesce(tp.full_name, 'Giáo viên') into v_parent, v_teacher
    from public.chat_conversations c
    left join public.profiles pp on pp.id = c.parent_id
    left join public.profiles tp on tp.id = c.teacher_id
    where c.id = new.conversation_id;
    select coalesce(full_name, '') into v_sender from public.profiles where id = new.sender_id;
    perform public.admin_feed_push('chat', new.sender_id, 'chat:' || new.conversation_id,
      'Tin nhắn: ' || coalesce(v_parent, '') || ' ↔ ' || coalesce(v_teacher, ''),
      v_sender || ': ' || coalesce(left(regexp_replace(trim(new.body), '\s+', ' ', 'g'), 140), '📷 Hình ảnh'),
      '/admin/chat?c=' || new.conversation_id);
  exception when others then raise warning 'admin_feed_chat: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_chat on public.chat_messages;
create trigger admin_feed_chat after insert on public.chat_messages
  for each row execute function public.admin_feed_chat();

-- -----------------------------------------------------------------------------
-- 4. Bài tập: giáo viên giao bài; phụ huynh nộp bài (gộp theo bài); giáo viên chấm (gộp theo cô / ngày)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_homework_assigned()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.admin_feed_push('homework', coalesce(new.teacher_id, (select auth.uid())), null,
      'Bài tập mới cho lớp ' || new.class_name,
      new.title || case when new.due_date is not null then ' · hạn ' || to_char(new.due_date, 'DD/MM') else '' end,
      '/admin/grading?tab=assign');
  exception when others then raise warning 'admin_feed_homework_assigned: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_homework_assigned on public.homework_assignments;
create trigger admin_feed_homework_assigned after insert on public.homework_assignments
  for each row execute function public.admin_feed_homework_assigned();

create or replace function public.admin_feed_homework_submission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_title   text;
  v_student text := public.admin_feed_student_label(new.student_id);
begin
  begin
    select a.title into v_title from public.homework_assignments a where a.id = new.assignment_id;
    if tg_op = 'INSERT' then
      perform public.admin_feed_push('homework', new.parent_id, 'hw-submit:' || new.assignment_id,
        'Phụ huynh nộp bài: ' || coalesce(v_title, ''),
        'Mới nhất: bé ' || coalesce(v_student, ''),
        '/admin/grading');
    elsif new.status = 'graded' and (old.status is distinct from 'graded') then
      perform public.admin_feed_push('homework', coalesce(new.graded_by, (select auth.uid())),
        'hw-grade:' || coalesce(new.graded_by, (select auth.uid())) || ':' || (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        'Giáo viên chấm bài tập',
        'Mới nhất: bé ' || coalesce(v_student, '') || ' · ' || coalesce(v_title, '') || ' · ' || coalesce(new.stars, 0) || ' sao',
        '/admin/grading?view=graded');
    end if;
  exception when others then raise warning 'admin_feed_homework_submission: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_homework_submission on public.homework_submissions;
create trigger admin_feed_homework_submission after insert or update of status on public.homework_submissions
  for each row execute function public.admin_feed_homework_submission();

-- -----------------------------------------------------------------------------
-- 5. Sổ liên lạc (gộp theo giáo viên / ngày)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_daily_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.teacher_id);
begin
  begin
    perform public.admin_feed_push('daily_report', v_actor, 'daily:' || v_actor || ':' || new.date,
      'Sổ liên lạc ngày ' || to_char(new.date, 'DD/MM'),
      'Mới nhất: bé ' || coalesce(public.admin_feed_student_label(new.student_id), ''),
      '/admin/daily-report');
  exception when others then raise warning 'admin_feed_daily_report: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_daily_report on public.daily_reports;
create trigger admin_feed_daily_report after insert on public.daily_reports
  for each row execute function public.admin_feed_daily_report();

-- -----------------------------------------------------------------------------
-- 6. Điểm danh (gộp theo lớp / ngày, kèm số liệu cả lớp)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_attendance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_campus  public.campus;
  v_class   text;
  v_counts  record;
begin
  -- Điểm danh do duyệt đơn nghỉ tự ghi → đã có thông báo "đồng ý đơn"
  if coalesce(current_setting('thedu.skip_attendance_notify', true), '') = 'on' then
    return new;
  end if;
  begin
    select s.campus, s.class_name into v_campus, v_class from public.students s where s.id = new.student_id;
    select count(*) filter (where a.status::text = 'present') as present,
           count(*) filter (where a.status::text = 'late') as late,
           count(*) filter (where a.status::text = 'absent') as absent,
           count(*) filter (where a.status::text = 'absent_with_permission') as excused
      into v_counts
    from public.attendance a join public.students s on s.id = a.student_id
    where a.date = new.date and s.campus = v_campus and s.class_name = v_class;
    perform public.admin_feed_push('attendance', (select auth.uid()), 'att:' || v_campus || ':' || v_class || ':' || new.date,
      'Điểm danh lớp ' || v_class || ' · ' || to_char(new.date, 'DD/MM'),
      v_counts.present || ' có mặt · ' || v_counts.late || ' muộn · ' || v_counts.absent || ' vắng'
        || case when v_counts.excused > 0 then ' · ' || v_counts.excused || ' có phép' else '' end,
      '/admin/attendance');
  exception when others then raise warning 'admin_feed_attendance: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_attendance on public.attendance;
create trigger admin_feed_attendance after insert or update of status on public.attendance
  for each row execute function public.admin_feed_attendance();

-- -----------------------------------------------------------------------------
-- 7. Tổng kết tháng gửi phụ huynh (gộp theo giáo viên / tháng)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_summary()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.teacher_id);
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') then
    return new;
  end if;
  begin
    perform public.admin_feed_push('summary', v_actor, 'summary:' || v_actor || ':' || new.month,
      'Gửi tổng kết tháng ' || to_char(new.month, 'MM/YYYY'),
      'Mới nhất: bé ' || coalesce(public.admin_feed_student_label(new.student_id), ''),
      '/admin/student-analytics');
  exception when others then raise warning 'admin_feed_summary: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_summary on public.monthly_summaries;
create trigger admin_feed_summary after insert or update of status on public.monthly_summaries
  for each row execute function public.admin_feed_summary();

-- -----------------------------------------------------------------------------
-- Realtime: chuông của quản trị viên cập nhật ngay
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications') then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;

-- >>> supabase/migrations/20261105000000_admin_feed_reads.sql
-- =============================================================================
-- Thông báo của quản trị viên: đánh dấu ĐÃ XEM TỪNG MỤC (bấm vào thông báo → không còn hiện là mới).
-- Mục được gộp mà có hoạt động mới sau lúc xem (updated_at > read_at) → hiện lại là mới.
-- Cần đã chạy: apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create table if not exists public.admin_notification_reads (
  admin_id         uuid not null references public.profiles (id) on delete cascade,
  notification_id  uuid not null references public.admin_notifications (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (admin_id, notification_id)
);
create index if not exists admin_notification_reads_notification_idx on public.admin_notification_reads (notification_id);

alter table public.admin_notification_reads enable row level security;
revoke all on public.admin_notification_reads from anon;
drop policy if exists "admin_notification_reads_own" on public.admin_notification_reads;
create policy "admin_notification_reads_own" on public.admin_notification_reads
  for all to authenticated
  using (admin_id = (select auth.uid()) and (select public.is_admin()))
  with check (admin_id = (select auth.uid()) and (select public.is_admin()));

-- Số thông báo CHƯA XEM của quản trị viên đang đăng nhập (chạy với quyền người gọi → RLS áp dụng)
create or replace function public.admin_feed_unread_count()
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer
  from public.admin_notifications n
  left join public.admin_notification_state s on s.admin_id = (select auth.uid())
  left join public.admin_notification_reads r on r.notification_id = n.id and r.admin_id = (select auth.uid())
  where n.updated_at > coalesce(s.last_seen_at, now() - interval '7 days')
    and (r.read_at is null or n.updated_at > r.read_at);
$$;
revoke execute on function public.admin_feed_unread_count() from public, anon;
grant execute on function public.admin_feed_unread_count() to authenticated;

-- >>> supabase/migrations/20261106000000_finance.sql
-- =============================================================================
-- Quản lý & nhắc học phí:
--   1. Mã học sinh (students.student_code, vd TH00012) — dùng trong nội dung chuyển khoản VietQR để đối soát.
--   2. Tài khoản nhận học phí của trung tâm (payment_config, 1 dòng) — phụ huynh đọc để tạo mã VietQR.
--   3. Nhắc học phí tự động: send_fee_reminders() tạo thông báo "fee_reminder" cho phụ huynh
--        - trước hạn 3 ngày;
--        - khi quá hạn (ngày đầu tiên quá hạn, rồi mỗi 7 ngày, tối đa 4 lần).
--      Chạy hằng ngày 08:00 giờ Việt Nam bằng pg_cron (nếu bật được) — thông báo mới → push (autodispatch / app).
-- Chạy lại nhiều lần vẫn an toàn. SQL Editor chạy 1 giao dịch → enum mới chỉ dùng qua ép kiểu text.
-- =============================================================================

alter type public.notification_type add value if not exists 'fee_reminder';

-- -----------------------------------------------------------------------------
-- 1. Mã học sinh
-- -----------------------------------------------------------------------------
create sequence if not exists public.student_code_seq start 1;

alter table public.students add column if not exists student_code text;

-- Học sinh cũ: cấp mã theo thứ tự tạo
do $$
declare
  r record;
begin
  for r in select id from public.students where student_code is null order by created_at, id loop
    update public.students set student_code = 'TH' || lpad(nextval('public.student_code_seq')::text, 5, '0') where id = r.id;
  end loop;
end;
$$;

alter table public.students alter column student_code set default ('TH' || lpad(nextval('public.student_code_seq')::text, 5, '0'));
create unique index if not exists students_student_code_uidx on public.students (student_code);

-- -----------------------------------------------------------------------------
-- 2. Tài khoản nhận học phí (VietQR)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_config (
  id            boolean primary key default true,
  bank_bin      text not null,
  bank_name     text not null,
  account_no    text not null,
  account_name  text not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,
  constraint payment_config_single check (id),
  constraint payment_config_bin check (bank_bin ~ '^[0-9]{6}$'),
  constraint payment_config_account check (account_no ~ '^[0-9A-Za-z]{4,19}$'),
  constraint payment_config_name check (length(trim(account_name)) between 2 and 70)
);

alter table public.payment_config enable row level security;
revoke all on public.payment_config from anon;
drop policy if exists "payment_config_read" on public.payment_config;
create policy "payment_config_read" on public.payment_config
  for select to authenticated using (true);
drop policy if exists "admin_all_payment_config" on public.payment_config;
create policy "admin_all_payment_config" on public.payment_config
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 3. Nhắc học phí
-- -----------------------------------------------------------------------------
create table if not exists public.fee_reminder_runs (
  id           uuid primary key default gen_random_uuid(),
  run_date     date not null,
  due_soon     integer not null default 0,
  overdue      integer not null default 0,
  triggered_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.fee_reminder_runs enable row level security;
revoke all on public.fee_reminder_runs from anon;
drop policy if exists "admin_select_fee_reminder_runs" on public.fee_reminder_runs;
create policy "admin_select_fee_reminder_runs" on public.fee_reminder_runs
  for select to authenticated using ((select public.is_admin()));

/**
 * Tạo thông báo nhắc học phí cho ngày p_today (mặc định hôm nay giờ VN). Mỗi khoản thu chỉ nhắc 1 lần / mốc
 * → chạy lại trong ngày không gửi trùng. Chỉ quản trị viên hoặc lịch tự động (không có người dùng) được gọi.
 */
create or replace function public.send_fee_reminders(p_today date default null)
returns table (due_soon integer, overdue integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_today   date := coalesce(p_today, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_uid     uuid := (select auth.uid());
  r         record;
  v_soon    integer := 0;
  v_over    integer := 0;
  v_late    integer;
  v_name    text;
  v_left    text;
begin
  if v_uid is not null and not public.is_admin() then
    raise exception 'Chỉ quản trị viên được chạy nhắc học phí' using errcode = '42501';
  end if;

  for r in
    select f.id, f.title, f.amount, f.paid_amount, f.due_date, f.student_id, s.full_name, s.parent_id
    from public.fees f
    join public.students s on s.id = f.student_id
    where f.status::text <> 'paid' and f.due_date is not null and f.amount > f.paid_amount and s.parent_id is not null
      and (f.due_date = v_today + 3 or f.due_date < v_today)
  loop
    -- Đã nhắc khoản này hôm nay → bỏ qua (không làm mới / đẩy lại)
    continue when exists (
      select 1 from public.notifications n
      where n.ref_id = r.id and n.type::text = 'fee_reminder' and n.ref_date = v_today
    );
    v_name := public.given_name(r.full_name);
    v_left := to_char(r.amount - r.paid_amount, 'FM999G999G999G999') || ' đ';

    if r.due_date = v_today + 3 then
      perform public.notify_parent_ref(
        r.student_id, 'fee_reminder'::text::public.notification_type, v_today, r.id,
        format('Nhắc nhẹ: học phí của bé %s sắp đến hạn', v_name),
        format('Khoản "%s" còn %s, hạn đóng %s (còn 3 ngày). Bố mẹ có thể thanh toán nhanh bằng mã QR trong mục Học phí. Cảm ơn bố mẹ đã đồng hành cùng trung tâm! 💚',
               r.title, v_left, to_char(r.due_date, 'DD/MM'))
      );
      v_soon := v_soon + 1;
    else
      v_late := v_today - r.due_date;
      -- Ngày đầu quá hạn, rồi mỗi 7 ngày (1, 8, 15, 22) — không làm phiền hằng ngày
      continue when v_late > 22 or (v_late - 1) % 7 <> 0;
      perform public.notify_parent_ref(
        r.student_id, 'fee_reminder'::text::public.notification_type, v_today, r.id,
        format('Học phí của bé %s đã quá hạn %s ngày', v_name, v_late),
        format('Khoản "%s" còn %s (hạn %s). Nếu bố mẹ đã chuyển khoản, xin bỏ qua tin này — trung tâm sẽ cập nhật sớm. Cần hỗ trợ, bố mẹ nhắn cô hoặc gọi 0978.951.289 ạ.',
               r.title, v_left, to_char(r.due_date, 'DD/MM'))
      );
      v_over := v_over + 1;
    end if;
  end loop;

  insert into public.fee_reminder_runs (run_date, due_soon, overdue, triggered_by) values (v_today, v_soon, v_over, v_uid);
  return query select v_soon, v_over;
end;
$$;
revoke execute on function public.send_fee_reminders(date) from public, anon;
grant execute on function public.send_fee_reminders(date) to authenticated;

-- Lịch tự động 08:00 giờ VN (= 01:00 UTC) mỗi ngày. Không bật được pg_cron → bỏ qua (dùng nút "Gửi nhắc ngay" / cron ngoài).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Không bật được pg_cron: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('thedu-fee-reminders') where exists (select 1 from cron.job where jobname = 'thedu-fee-reminders');
      perform cron.schedule('thedu-fee-reminders', '0 1 * * *', 'select public.send_fee_reminders()');
    exception when others then
      raise notice 'Không lập lịch được nhắc học phí: %', sqlerrm;
    end;
  end if;
end;
$$;

-- >>> supabase/migrations/20261107000000_bank_reconcile.sql
-- =============================================================================
-- Tự động gạch nợ học phí từ biến động số dư ngân hàng (webhook SePay / Casso):
--   1. bank_transactions: mọi giao dịch tiền vào nhận được (chống xử lý trùng theo provider + mã giao dịch),
--      trạng thái khớp: matched (đã gạch nợ) / partial (còn tiền thừa chưa gán) / unmatched (chưa khớp) / ignored.
--   2. Phụ huynh nhận thông báo "fee_paid" mỗi khi khoản học phí được ghi nhận thêm tiền (tự động hoặc trung tâm ghi tay).
--   3. Bảng tin quản trị: thêm loại "payment" và người thực hiện "system" (giao dịch chưa khớp cần xử lý).
-- Cần đã chạy: apply-finance.sql, apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

alter type public.notification_type add value if not exists 'fee_paid';

create table if not exists public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  provider_txn_id  text not null,
  amount           numeric(14, 0) not null,
  content          text not null default '',
  account_no       text,
  txn_at           timestamptz,
  status           text not null default 'unmatched',
  student_id       uuid references public.students (id) on delete set null,
  matched_fee_ids  uuid[] not null default '{}',
  applied_amount   numeric(14, 0) not null default 0,
  note             text,
  raw              jsonb,
  handled_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bank_transactions_unique unique (provider, provider_txn_id),
  constraint bank_transactions_status_valid check (status in ('matched', 'partial', 'unmatched', 'ignored'))
);
create index if not exists bank_transactions_created_idx on public.bank_transactions (created_at desc);
create index if not exists bank_transactions_unmatched_idx on public.bank_transactions (created_at desc) where status in ('unmatched', 'partial');

drop trigger if exists bank_transactions_touch on public.bank_transactions;
create trigger bank_transactions_touch before update on public.bank_transactions
  for each row execute function public.touch_updated_at();

alter table public.bank_transactions enable row level security;
revoke all on public.bank_transactions from anon;
drop policy if exists "admin_all_bank_transactions" on public.bank_transactions;
create policy "admin_all_bank_transactions" on public.bank_transactions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Phụ huynh: "Trung tâm đã nhận học phí" mỗi khi số tiền đã đóng tăng
-- -----------------------------------------------------------------------------
create or replace function public.fees_paid_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_left numeric;
begin
  if new.paid_amount <= old.paid_amount then
    return new;
  end if;
  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  v_left := greatest(new.amount - new.paid_amount, 0);
  perform public.notify_parent_ref(
    new.student_id,
    'fee_paid'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    new.id,
    format('Trung tâm đã nhận học phí của bé %s', coalesce(v_name, '')),
    format('Đã nhận %s đ cho khoản "%s". ', to_char(new.paid_amount - old.paid_amount, 'FM999G999G999G999'), new.title)
      || case when v_left = 0 then 'Khoản này đã hoàn thành. Cảm ơn bố mẹ! 💚'
              else format('Còn lại %s đ.', to_char(v_left, 'FM999G999G999G999')) end
  );
  return new;
end;
$$;

drop trigger if exists fees_paid_notify on public.fees;
create trigger fees_paid_notify after update of paid_amount on public.fees
  for each row execute function public.fees_paid_notify();

-- -----------------------------------------------------------------------------
-- Bảng tin quản trị: loại "payment", người thực hiện "system"
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.admin_notifications') is not null then
    alter table public.admin_notifications drop constraint if exists admin_notifications_category_valid;
    alter table public.admin_notifications add constraint admin_notifications_category_valid
      check (category in ('feedback', 'leave', 'chat', 'homework', 'daily_report', 'attendance', 'summary', 'payment'));
    alter table public.admin_notifications drop constraint if exists admin_notifications_actor_role_valid;
    alter table public.admin_notifications add constraint admin_notifications_actor_role_valid
      check (actor_role in ('parent', 'teacher', 'system'));
  end if;
end;
$$;

-- >>> supabase/migrations/20261108000000_moments.sql
-- =============================================================================
-- "Góc Khoảnh Khắc": album ảnh / video hoạt động lớp như mạng xã hội nội bộ thu nhỏ.
--   - Giáo viên đăng chuỗi ảnh/video cho CẢ LỚP hoặc NHÓM NHỎ (chỉ phụ huynh các bé được gắn thẻ thấy).
--   - Gắn thẻ học sinh trên từng ảnh → phụ huynh lọc "Ảnh có bé nhà mình", tải ảnh gốc.
--   - Thả tim / like, bình luận (tên hiển thị ẩn danh hoá: "Bố/mẹ bé An" — không lộ họ tên, SĐT phụ huynh khác).
--   - Thông báo: bài mới (riêng cho bé được gắn thẻ), bình luận mới → giáo viên + phụ huynh liên quan.
-- QUYỀN RIÊNG TƯ: mọi quyền xem (bài, ảnh trong kho, cảm xúc, bình luận) đi qua 1 hàm duy nhất can_view_moment().
-- Chạy lại nhiều lần vẫn an toàn. Enum mới chỉ dùng qua ép kiểu text (SQL Editor chạy 1 giao dịch).
-- =============================================================================

alter type public.notification_type add value if not exists 'moment_posted';
alter type public.notification_type add value if not exists 'moment_comment';

create table if not exists public.moments (
  id           uuid primary key default gen_random_uuid(),
  campus       public.campus not null,
  class_name   text not null,
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text not null default '',
  category     text not null default 'class',
  visibility   text not null default 'class',
  caption      text not null default '',
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint moments_class_fkey foreign key (campus, class_name) references public.classes (campus, name) on update cascade on delete cascade,
  constraint moments_category_valid check (category in ('class', 'toan_tu_duy', 'luyen_chu', 'tien_tieu_hoc', 'ngoai_khoa')),
  constraint moments_visibility_valid check (visibility in ('class', 'tagged')),
  constraint moments_caption_length check (length(caption) <= 2000)
);
create index if not exists moments_class_idx on public.moments (campus, class_name, published_at desc) where published;

create table if not exists public.moment_media (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid not null references public.moments (id) on delete cascade,
  path        text not null,
  kind        text not null default 'image',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint moment_media_kind check (kind in ('image', 'video')),
  constraint moment_media_path check (path like moment_id::text || '/%')
);
create index if not exists moment_media_moment_idx on public.moment_media (moment_id, position);

create table if not exists public.moment_media_tags (
  media_id    uuid not null references public.moment_media (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  primary key (media_id, student_id)
);
create index if not exists moment_media_tags_student_idx on public.moment_media_tags (student_id);

create table if not exists public.moment_reactions (
  moment_id   uuid not null references public.moments (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (moment_id, user_id, kind),
  constraint moment_reactions_kind check (kind in ('heart', 'like'))
);

create table if not exists public.moment_comments (
  id            uuid primary key default gen_random_uuid(),
  moment_id     uuid not null references public.moments (id) on delete cascade,
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_label  text not null default '',
  author_role   text not null default 'parent',
  body          text not null,
  created_at    timestamptz not null default now(),
  constraint moment_comments_body check (length(trim(body)) between 1 and 500)
);
create index if not exists moment_comments_moment_idx on public.moment_comments (moment_id, created_at);

drop trigger if exists moments_touch on public.moments;
create trigger moments_touch before update on public.moments for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Quyền xem — DUY NHẤT một chỗ
-- -----------------------------------------------------------------------------
create or replace function public.can_view_moment(p_moment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment
      and (
        (select public.is_admin())
        or public.teacher_manages(m.campus, m.class_name)
        or (
          m.published
          and exists (
            select 1 from public.students s
            where s.parent_id = (select auth.uid()) and s.campus = m.campus and s.class_name = m.class_name
              and (
                m.visibility = 'class'
                or exists (
                  select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id
                  where mm.moment_id = m.id and t.student_id = s.id
                )
              )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_moment(p_moment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment and ((select public.is_admin()) or public.teacher_manages(m.campus, m.class_name))
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.moments enable row level security;
alter table public.moment_media enable row level security;
alter table public.moment_media_tags enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_comments enable row level security;
revoke all on public.moments, public.moment_media, public.moment_media_tags, public.moment_reactions, public.moment_comments from anon;

drop policy if exists "moments_select" on public.moments;
create policy "moments_select" on public.moments for select to authenticated using (public.can_view_moment(id));
drop policy if exists "moments_insert" on public.moments;
create policy "moments_insert" on public.moments for insert to authenticated
  with check (((select public.is_admin()) or public.teacher_manages(campus, class_name)) and author_id = (select auth.uid()));
drop policy if exists "moments_update" on public.moments;
create policy "moments_update" on public.moments for update to authenticated
  using ((select public.is_admin()) or public.teacher_manages(campus, class_name))
  with check ((select public.is_admin()) or public.teacher_manages(campus, class_name));
drop policy if exists "moments_delete" on public.moments;
create policy "moments_delete" on public.moments for delete to authenticated
  using ((select public.is_admin()) or public.teacher_manages(campus, class_name));

drop policy if exists "moment_media_select" on public.moment_media;
create policy "moment_media_select" on public.moment_media for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_media_write" on public.moment_media;
create policy "moment_media_write" on public.moment_media for all to authenticated
  using (public.can_manage_moment(moment_id)) with check (public.can_manage_moment(moment_id));

drop policy if exists "moment_media_tags_select" on public.moment_media_tags;
create policy "moment_media_tags_select" on public.moment_media_tags for select to authenticated
  using (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_view_moment(mm.moment_id)));
drop policy if exists "moment_media_tags_write" on public.moment_media_tags;
create policy "moment_media_tags_write" on public.moment_media_tags for all to authenticated
  using (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_manage_moment(mm.moment_id)))
  with check (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_manage_moment(mm.moment_id)));

drop policy if exists "moment_reactions_select" on public.moment_reactions;
create policy "moment_reactions_select" on public.moment_reactions for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_reactions_insert" on public.moment_reactions;
create policy "moment_reactions_insert" on public.moment_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_moment(moment_id));
drop policy if exists "moment_reactions_delete" on public.moment_reactions;
create policy "moment_reactions_delete" on public.moment_reactions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "moment_comments_select" on public.moment_comments;
create policy "moment_comments_select" on public.moment_comments for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_comments_insert" on public.moment_comments;
create policy "moment_comments_insert" on public.moment_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_moment(moment_id));
drop policy if exists "moment_comments_delete" on public.moment_comments;
create policy "moment_comments_delete" on public.moment_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_moment(moment_id));

-- Tên hiển thị khi bình luận: giáo viên = họ tên; phụ huynh = "Bố/mẹ bé <tên gọi>" (con học lớp đó) — không lộ danh tính
create or replace function public.moment_comment_label()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role  text;
  v_name  text;
  v_child text;
begin
  select p.role::text, p.full_name into v_role, v_name from public.profiles p where p.id = new.author_id;
  if v_role = 'parent' then
    select string_agg(public.given_name(s.full_name), ', ' order by s.full_name) into v_child
    from public.students s join public.moments m on m.id = new.moment_id
    where s.parent_id = new.author_id and s.campus = m.campus and s.class_name = m.class_name;
    new.author_label := 'Bố/mẹ bé ' || coalesce(v_child, '');
    new.author_role := 'parent';
  else
    new.author_label := coalesce(nullif(v_name, ''), case when v_role = 'admin' then 'Trung tâm TH EDU' else 'Giáo viên' end);
    new.author_role := coalesce(v_role, 'teacher');
  end if;
  return new;
end;
$$;
drop trigger if exists moment_comment_label on public.moment_comments;
create trigger moment_comment_label before insert on public.moment_comments
  for each row execute function public.moment_comment_label();

-- -----------------------------------------------------------------------------
-- Kho ảnh PRIVATE `moments`: {moment_id}/{file} — quyền đọc = quyền xem bài
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 104857600, array['image/*', 'video/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "moments_read" on storage.objects;
create policy "moments_read" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and public.can_view_moment(public.safe_uuid((storage.foldername(name))[1])));
drop policy if exists "moments_insert" on storage.objects;
create policy "moments_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and public.can_manage_moment(public.safe_uuid((storage.foldername(name))[1])));
drop policy if exists "moments_delete" on storage.objects;
create policy "moments_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and public.can_manage_moment(public.safe_uuid((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- Thông báo
-- -----------------------------------------------------------------------------
-- Đăng bài (published false → true): phụ huynh trong lớp (hoặc chỉ phụ huynh bé được gắn thẻ); bé có trong ảnh → báo riêng
create or replace function public.moment_published_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_count integer;
begin
  if not new.published or (tg_op = 'UPDATE' and old.published) then
    return new;
  end if;
  select count(*) into v_count from public.moment_media where moment_id = new.id;
  for r in
    select distinct on (s.parent_id) s.id as student_id, public.given_name(s.full_name) as name,
           exists (select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id
                   where mm.moment_id = new.id and t.student_id = s.id) as tagged
    from public.students s
    where s.campus = new.campus and s.class_name = new.class_name and s.parent_id is not null
    order by s.parent_id, 3 desc
  loop
    continue when new.visibility = 'tagged' and not r.tagged;
    perform public.notify_parent_ref(
      r.student_id, 'moment_posted'::text::public.notification_type, (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.id,
      case when r.tagged then format('📸 Bé %s xuất hiện trong khoảnh khắc mới của lớp %s', r.name, new.class_name)
           else format('📸 Lớp %s có khoảnh khắc mới', new.class_name) end,
      coalesce(nullif(left(trim(new.caption), 120), ''), format('%s ảnh / video mới từ %s', v_count, coalesce(nullif(new.author_name, ''), 'cô giáo')))
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists moment_published_notify on public.moments;
create trigger moment_published_notify after insert or update of published on public.moments
  for each row execute function public.moment_published_notify();

-- Bình luận mới → giáo viên đăng bài + phụ huynh các bé được gắn thẻ + những người đã bình luận (trừ người viết)
create or replace function public.moment_comment_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_moment  record;
  v_student uuid;
  r         record;
  v_title   text;
  v_body    text;
begin
  select * into v_moment from public.moments where id = new.moment_id;
  if not found or not v_moment.published then
    return new;
  end if;
  v_title := format('💬 %s bình luận khoảnh khắc lớp %s', new.author_label, v_moment.class_name);
  v_body := left(trim(new.body), 140);

  -- Giáo viên đăng bài (thông báo gắn với 1 học sinh trong lớp để hiện đúng trang)
  if v_moment.author_id is not null and v_moment.author_id <> new.author_id then
    select s.id into v_student from public.students s where s.campus = v_moment.campus and s.class_name = v_moment.class_name limit 1;
    if v_student is not null then
      insert into public.notifications as n (recipient_id, student_id, type, ref_date, ref_id, title, body)
      values (v_moment.author_id, v_student, 'moment_comment'::text::public.notification_type, (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.moment_id, v_title, v_body)
      on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
        set title = excluded.title, body = excluded.body, read_at = null, pushed_at = null, created_at = now();
    end if;
  end if;

  -- Phụ huynh liên quan
  for r in
    select distinct on (s.parent_id) s.id as student_id
    from public.students s
    where s.campus = v_moment.campus and s.class_name = v_moment.class_name and s.parent_id is not null and s.parent_id <> new.author_id
      and (
        exists (select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id where mm.moment_id = new.moment_id and t.student_id = s.id)
        or exists (select 1 from public.moment_comments c where c.moment_id = new.moment_id and c.author_id = s.parent_id and c.id <> new.id)
      )
    order by s.parent_id
  loop
    perform public.notify_parent_ref(r.student_id, 'moment_comment'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.moment_id, v_title, v_body);
  end loop;
  return new;
end;
$$;
drop trigger if exists moment_comment_notify on public.moment_comments;
create trigger moment_comment_notify after insert on public.moment_comments
  for each row execute function public.moment_comment_notify();

-- Realtime: bảng tin khoảnh khắc cập nhật ngay
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['moments', 'moment_comments', 'moment_reactions'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Tên gọi các bé được gắn thẻ (chỉ tên gọi, chỉ bài người xem được phép xem) — phụ huynh không đọc được hồ sơ bé khác
create or replace function public.moment_tag_names(p_moment_ids uuid[])
returns table (moment_id uuid, media_id uuid, student_id uuid, given_name text)
language sql stable security definer set search_path = ''
as $$
  select mm.moment_id, t.media_id, t.student_id, public.given_name(s.full_name)
  from public.moment_media mm
  join public.moment_media_tags t on t.media_id = mm.id
  join public.students s on s.id = t.student_id
  where mm.moment_id = any (p_moment_ids) and public.can_view_moment(mm.moment_id);
$$;
revoke execute on function public.moment_tag_names(uuid[]) from public, anon;
grant execute on function public.moment_tag_names(uuid[]) to authenticated;

-- Xoá bài → gỡ thông báo về bài đó (của mọi người nhận)
create or replace function public.moment_deleted_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n where n.ref_id = old.id and n.type::text in ('moment_posted', 'moment_comment');
  return old;
end;
$$;
drop trigger if exists moment_deleted_cleanup on public.moments;
create trigger moment_deleted_cleanup after delete on public.moments
  for each row execute function public.moment_deleted_cleanup();

-- >>> supabase/migrations/20261109000000_security_audit.sql
-- =============================================================================
-- Bảo mật nâng cao & Nhật ký hoạt động (Security & Audit)
--
--  A. Củng cố RLS / quyền:
--     - anon (chưa đăng nhập) KHÔNG có quyền gì trên bảng / sequence / hàm của schema public — kể cả bảng tạo sau này.
--     - Mọi bảng public bắt buộc bật RLS (bảng nào quên → bật, không policy = không ai đọc được).
--     - Hàm: thu hồi EXECUTE mặc định của PUBLIC/anon; chỉ cấp cho authenticated các hàm không phải nội bộ.
--     - students: chỉ quản trị viên được đổi phụ huynh / cơ sở / lớp của học sinh (chặn gắn bé sang tài khoản khác).
--     - profiles: chỉ quản trị viên được đổi SĐT (SĐT dùng để liên kết phụ huynh ↔ học sinh).
--  B. audit_logs: tự ghi mọi thao tác TẠO / SỬA / XOÁ dữ liệu nhạy cảm của giáo viên, quản trị viên và hệ thống
--     (điểm danh, học phí, sổ liên lạc, học sinh, phân công…). Chỉ quản trị viên xem; không ai sửa / xoá được.
--  C. rate_limits: bộ đếm chống spam / dò mật khẩu dùng chung giữa các instance (chỉ service_role gọi).
--  D. security_audit_report(): quản trị viên tự kiểm tra cấu hình bảo mật ngay trong app.
--
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- =============================================================================
-- A. CỦNG CỐ QUYỀN
-- =============================================================================

-- A.1 anon: không có quyền trên dữ liệu nghiệp vụ (đăng nhập đi qua Supabase Auth, không đọc bảng)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- A.2 Bảng nào trong public chưa bật RLS → bật (không policy = từ chối tất cả với authenticated)
do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', t.tbl);
    raise notice 'Đã bật RLS cho bảng %', t.tbl;
  end loop;
end $$;

-- A.3 students: chỉ admin được đổi phụ huynh / cơ sở / lớp (policy cho giáo viên sửa HS trong phạm vi
--     không đủ: giáo viên có thể đổi parent_id → lộ dữ liệu bé cho tài khoản khác).
create or replace function public.protect_student_structural_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (new.parent_id  is distinct from old.parent_id
       or new.campus     is distinct from old.campus
       or new.class_name is distinct from old.class_name
       or new.id         is distinct from old.id) then
    raise exception 'Chỉ quản trị viên được đổi phụ huynh, cơ sở hoặc lớp của học sinh'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists students_protect_structural_columns on public.students;
create trigger students_protect_structural_columns
  before update on public.students
  for each row execute function public.protect_student_structural_columns();

-- A.4 profiles: thêm SĐT vào nhóm cột chỉ admin được đổi
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (new.role   is distinct from old.role
       or new.campus is distinct from old.campus
       or new.phone  is distinct from old.phone
       or new.id     is distinct from old.id) then
    raise exception 'Không có quyền thay đổi vai trò / cơ sở / số điện thoại'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- B. NHẬT KÝ HOẠT ĐỘNG (audit_logs)
-- =============================================================================
create table if not exists public.audit_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid,                 -- auth.uid() người thao tác; NULL = hệ thống (webhook ngân hàng, cron, SQL)
  actor_name      text,                 -- tên lúc thao tác (giữ lại kể cả khi tài khoản bị xoá)
  actor_role      text not null,        -- admin | teacher | system
  action          text not null,        -- CREATE | UPDATE | DELETE
  table_name      text not null,
  record_id       text,
  student_id      uuid,                 -- học sinh liên quan (lọc nhanh khi có tranh chấp)
  changed_fields  text[],
  old_data        jsonb,                -- UPDATE: chỉ các cột thay đổi; DELETE: toàn bộ bản ghi
  new_data        jsonb,                -- UPDATE: chỉ các cột thay đổi; CREATE: toàn bộ bản ghi
  created_at      timestamptz not null default now(),
  constraint audit_logs_action_check check (action in ('CREATE', 'UPDATE', 'DELETE')),
  constraint audit_logs_role_check check (actor_role in ('admin', 'teacher', 'system'))
);
comment on table public.audit_logs is
  'Nhật ký thay đổi dữ liệu nhạy cảm (ghi tự động bằng trigger audit_row_change). Chỉ thêm, không sửa/xoá.';

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_table_idx   on public.audit_logs (table_name, created_at desc);
create index if not exists audit_logs_user_idx    on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_student_idx on public.audit_logs (student_id, created_at desc) where student_id is not null;
create index if not exists audit_logs_record_idx  on public.audit_logs (record_id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- Chỉ thêm: không ai (kể cả service_role) sửa nhật ký; xoá chỉ khi chủ động bật cờ dọn dữ liệu cũ
--   begin; set local app.allow_audit_purge = 'on'; delete from public.audit_logs where created_at < now() - interval '2 years'; commit;
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_audit_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Nhật ký hoạt động không được sửa hoặc xoá' using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- Trigger chung. Tham số (TG_ARGV): các cột bỏ qua khi so sánh / không lưu (vd. ảnh base64, payload thô).
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_role     text;
  v_name     text;
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_ignore   text[] := array['updated_at', 'created_at'] || coalesce(tg_argv::text[], '{}');
  v_row      jsonb;
  v_student  uuid;
  k          text;
begin
  if v_uid is null then
    v_role := 'system';
  else
    select p.role::text, p.full_name into v_role, v_name from public.profiles p where p.id = v_uid;
    -- Chỉ ghi thao tác của giáo viên / quản trị viên (phụ huynh không sửa được dữ liệu nhạy cảm — RLS chặn)
    if v_role is null or v_role not in ('admin', 'teacher') then
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new); end if;
  foreach k in array v_ignore loop
    v_old := v_old - k;
    v_new := v_new - k;
  end loop;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key);
    -- upsert ghi lại giá trị y hệt (vd. lưu lại điểm danh cả lớp) → không phải thay đổi, bỏ qua
    if v_changed is null then
      return null;
    end if;
    select jsonb_object_agg(key, value) into v_old from jsonb_each(v_old) where key = any (v_changed);
    select jsonb_object_agg(key, value) into v_new from jsonb_each(v_new) where key = any (v_changed);
  end if;

  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  v_student := case
    when tg_table_name = 'students' then public.safe_uuid(v_row ->> 'id')
    else public.safe_uuid(v_row ->> 'student_id')
  end;

  insert into public.audit_logs (user_id, actor_name, actor_role, action, table_name, record_id, student_id, changed_fields, old_data, new_data)
  values (
    v_uid,
    coalesce(nullif(v_name, ''), case when v_uid is null then 'Hệ thống' else null end),
    v_role,
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    v_student,
    v_changed,
    v_old,
    v_new
  );
  return null;
end;
$$;

-- Gắn trigger vào các bảng nhạy cảm (bảng nào chưa có — chưa chạy migration tương ứng — thì bỏ qua)
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('attendance',           null),
      ('daily_reports',        null),
      ('fees',                 null),
      ('fee_payments',         null),
      ('students',             null),
      ('profiles',             null),
      ('teacher_assignments',  null),
      ('classes',              null),
      ('teacher_attendance',   null),
      ('homework_submissions', null),
      ('leave_requests',       null),
      ('monthly_summaries',    null),
      ('payment_config',       null),
      ('bank_transactions',    'raw')
    ) as v(tbl, ignore_cols)
  loop
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'Bỏ qua nhật ký cho bảng % (chưa tồn tại)', spec.tbl;
      continue;
    end if;
    execute format('drop trigger if exists audit_row_change on public.%I', spec.tbl);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change(%s)',
      spec.tbl,
      coalesce(quote_literal(spec.ignore_cols), '')
    );
  end loop;
end $$;

-- =============================================================================
-- C. RATE LIMIT (bộ đếm cửa sổ cố định — chỉ server gọi bằng service_role)
-- =============================================================================
create table if not exists public.rate_limits (
  key             text primary key,
  window_start    timestamptz not null default now(),
  window_seconds  integer not null,
  hit_count       integer not null default 0
);
alter table public.rate_limits enable row level security;   -- không policy: chỉ service_role
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_increment boolean default true)
returns table (hit_count integer, ttl_seconds integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.rate_limits;
begin
  if p_key is null or length(p_key) > 200 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Tham số rate limit không hợp lệ' using errcode = '22023';
  end if;

  if not p_increment then
    select * into r from public.rate_limits rl where rl.key = p_key;
    if not found or r.window_start + make_interval(secs => r.window_seconds) <= now() then
      return query select 0, 0;
    else
      return query select r.hit_count, greatest(1, ceil(extract(epoch from r.window_start + make_interval(secs => r.window_seconds) - now()))::integer);
    end if;
    return;
  end if;

  insert into public.rate_limits as rl (key, window_start, window_seconds, hit_count)
  values (p_key, now(), p_window_seconds, 1)
  on conflict (key) do update set
    hit_count      = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then 1 else rl.hit_count + 1 end,
    window_start   = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then now() else rl.window_start end,
    window_seconds = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then excluded.window_seconds else rl.window_seconds end
  returning * into r;

  -- Dọn bộ đếm đã hết hạn (thỉnh thoảng, không cần cron)
  if random() < 0.02 then
    delete from public.rate_limits rl where rl.window_start + make_interval(secs => rl.window_seconds) < now() - interval '1 hour';
  end if;

  return query select r.hit_count, greatest(1, ceil(extract(epoch from r.window_start + make_interval(secs => r.window_seconds) - now()))::integer);
end;
$$;

create or replace function public.rate_limit_reset(p_key text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.rate_limits where key = p_key;
$$;

-- =============================================================================
-- D. TỰ KIỂM TRA BẢO MẬT (quản trị viên gọi trong app)
-- =============================================================================
create or replace function public.security_audit_report()
returns table (severity text, category text, object_name text, detail text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được xem báo cáo bảo mật' using errcode = '42501';
  end if;

  -- Bảng chưa bật RLS
  return query
  select 'critical', 'rls', c.relname::text, 'Bảng chưa bật Row Level Security'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  -- Bảng bật RLS nhưng chưa có policy (không ai ngoài service_role đọc được — có thể là cố ý)
  return query
  select 'info', 'rls', c.relname::text, 'Đã bật RLS, chưa có policy (chỉ server/service_role truy cập)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  -- anon còn quyền trên bảng
  return query
  select 'critical', 'grant', g.table_name::text, 'anon còn quyền ' || string_agg(g.privilege_type, ', ' order by g.privilege_type)
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'anon'
  group by g.table_name;

  -- Hàm SECURITY DEFINER anon gọi được
  return query
  select 'high', 'function', p.oid::regprocedure::text, 'Hàm SECURITY DEFINER mà anon (chưa đăng nhập) gọi được'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute');

  -- Hàm SECURITY DEFINER không cố định search_path (có thể bị chiếm quyền qua schema giả)
  return query
  select 'high', 'function', p.oid::regprocedure::text, 'Hàm SECURITY DEFINER chưa đặt search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');

  -- Policy cho phép mọi người dùng đã đăng nhập (using true) — xem lại có cố ý không
  return query
  select 'info', 'policy', (c.relname || ' · ' || pol.polname)::text, 'Policy USING (true): mọi tài khoản đã đăng nhập đều đọc được'
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and pg_get_expr(pol.polqual, pol.polrelid) = 'true';

  -- Policy áp cho anon / public
  return query
  select 'high', 'policy', (c.relname || ' · ' || pol.polname)::text, 'Policy áp dụng cho anon / PUBLIC'
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and (0 = any (pol.polroles) or 'anon'::regrole = any (pol.polroles));

  -- Kho lưu trữ công khai
  return query
  select 'high', 'storage', b.id::text, 'Bucket đang để công khai (ai có link cũng xem được)'
  from storage.buckets b where b.public;
end;
$$;

-- =============================================================================
-- A.5 EXECUTE trên hàm: PUBLIC/anon → không; authenticated → mọi hàm trừ hàm nội bộ; service_role → tất cả
-- =============================================================================
do $$
declare
  f record;
  internal text[] := array[
    'notify_parent', 'notify_parent_ref', 'announcement_recipients', 'admin_feed_push', 'admin_feed_student_label',
    'rate_limit_hit', 'rate_limit_reset', 'audit_row_change', 'audit_logs_immutable'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- bỏ qua hàm của extension
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.is_trigger or f.proname = any (internal) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

commit;

-- >>> supabase/migrations/20261110000000_voice_of_parent.sql
-- =============================================================================
-- Lắng nghe phụ huynh & đánh giá chất lượng dịch vụ.
--
--  A. Góp ý & hỗ trợ (bảng feedback có sẵn) — bổ sung:
--     - Loại: góp ý / báo lỗi / thắc mắc; chủ đề thêm "Chương trình học", "Ứng dụng".
--     - GỬI ẨN DANH THẬT SỰ: feedback.parent_id = NULL, người gửi lưu ở feedback_anonymous_owners — chỉ chính phụ huynh
--       đó đọc được (xem lại góp ý + trả lời), quản trị viên KHÔNG đọc được. Thông báo trả lời vẫn tới đúng người,
--       nhưng quản trị viên không đọc được dòng thông báo đó (không suy ngược ra người gửi).
--     - Gửi kèm thông tin liên hệ (tên, SĐT, muốn được gọi lại) khi không ẩn danh.
--     - Thông báo cho phụ huynh cả khi đổi trạng thái (đang giải quyết / đã hoàn tất), không chỉ khi trả lời.
--     - Gửi qua RPC submit_feedback() (kiểm tra quyền + dữ liệu trong DB).
--  B. Khảo sát hài lòng định kỳ (satisfaction_surveys): mỗi phụ huynh 1 lần / tháng, 1–5 sao chung + từng môn
--     (Tiền tiểu học, Luyện chữ đẹp, Toán tư duy) + nhận xét ngắn; chấm ≤ 2 sao → báo ngay cho quản trị viên.
--
-- Cần đã chạy: apply-feedback-migration.sql, apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- Enum mới không dùng; giá trị enum cũ dùng bình thường.
-- =============================================================================
begin;

-- =============================================================================
-- A. GÓP Ý & HỖ TRỢ
-- =============================================================================
alter table public.feedback add column if not exists kind text not null default 'gop_y';
alter table public.feedback add column if not exists is_anonymous boolean not null default false;
alter table public.feedback add column if not exists contact_name text;
alter table public.feedback add column if not exists contact_phone text;
alter table public.feedback add column if not exists wants_callback boolean not null default false;
alter table public.feedback add column if not exists status_changed_at timestamptz;
alter table public.feedback alter column parent_id drop not null;

alter table public.feedback drop constraint if exists feedback_kind_valid;
alter table public.feedback add constraint feedback_kind_valid check (kind in ('gop_y', 'bao_loi', 'thac_mac'));

alter table public.feedback drop constraint if exists feedback_category_valid;
alter table public.feedback add constraint feedback_category_valid
  check (category in ('hoc_phi', 'chuong_trinh', 'giao_vien', 'co_so_vat_chat', 'ung_dung', 'hoc_tap', 'lich_hoc', 'khac'));

alter table public.feedback drop constraint if exists feedback_contact_valid;
alter table public.feedback add constraint feedback_contact_valid check (
  (contact_name is null or length(contact_name) <= 100)
  and (contact_phone is null or contact_phone ~ '^\+?[0-9]{9,15}$')
);

-- Ẩn danh: không người gửi, không bé, không thông tin liên hệ. Không ẩn danh: phải có người gửi.
alter table public.feedback drop constraint if exists feedback_anonymous_valid;
alter table public.feedback add constraint feedback_anonymous_valid check (
  (is_anonymous and parent_id is null and student_id is null and contact_name is null and contact_phone is null and not wants_callback)
  or (not is_anonymous and parent_id is not null)
);

create index if not exists feedback_category_idx on public.feedback (category, created_at desc);

-- Người gửi góp ý ẩn danh — CHỈ chính phụ huynh đó đọc được (không có policy cho quản trị viên)
create table if not exists public.feedback_anonymous_owners (
  feedback_id  uuid primary key references public.feedback (id) on delete cascade,
  parent_id    uuid not null references public.profiles (id) on delete cascade
);
create index if not exists feedback_anonymous_owners_parent_idx on public.feedback_anonymous_owners (parent_id);
alter table public.feedback_anonymous_owners enable row level security;
revoke all on public.feedback_anonymous_owners from anon, authenticated;
grant select on public.feedback_anonymous_owners to authenticated;
drop policy if exists "feedback_anon_owner_select" on public.feedback_anonymous_owners;
create policy "feedback_anon_owner_select" on public.feedback_anonymous_owners
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- Phụ huynh xem góp ý của mình: đứng tên HOẶC ẩn danh do chính mình gửi
drop policy if exists "feedback_parent_select" on public.feedback;
create policy "feedback_parent_select" on public.feedback
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or exists (select 1 from public.feedback_anonymous_owners o where o.feedback_id = feedback.id and o.parent_id = (select auth.uid()))
  );

-- Gửi trực tiếp vào bảng chỉ cho góp ý đứng tên; ẩn danh đi qua submit_feedback()
drop policy if exists "feedback_parent_insert" on public.feedback;
create policy "feedback_parent_insert" on public.feedback
  for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and not is_anonymous
    and status = 'new'
    and admin_reply is null
    and replied_by is null
    and replied_at is null
    and (student_id is null or public.is_parent_of(student_id))
  );

create or replace function public.feedback_is_anonymous(p_feedback_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select f.is_anonymous from public.feedback f where f.id = p_feedback_id), false);
$$;

-- Quản trị viên không đọc được thông báo trả lời góp ý ẩn danh (dòng đó lộ người nhận = người gửi)
drop policy if exists "admin_select_notifications" on public.notifications;
create policy "admin_select_notifications" on public.notifications
  for select to authenticated
  using ((select public.is_admin()) and (feedback_id is null or not public.feedback_is_anonymous(feedback_id)));

-- Gửi góp ý (đứng tên hoặc ẩn danh). Trả về id.
create or replace function public.submit_feedback(
  p_kind text,
  p_category text,
  p_content text,
  p_student_id uuid default null,
  p_anonymous boolean default false,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_wants_callback boolean default false
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null or public.current_user_role() <> 'parent' then
    raise exception 'Chỉ phụ huynh được gửi góp ý' using errcode = '42501';
  end if;
  if p_student_id is not null and not p_anonymous and not public.is_parent_of(p_student_id) then
    raise exception 'Không gửi được góp ý cho học sinh này' using errcode = '42501';
  end if;

  insert into public.feedback (parent_id, student_id, kind, category, content, is_anonymous, contact_name, contact_phone, wants_callback)
  values (
    case when p_anonymous then null else v_uid end,
    case when p_anonymous then null else p_student_id end,
    p_kind,
    p_category,
    trim(p_content),
    p_anonymous,
    case when p_anonymous then null else nullif(trim(p_contact_name), '') end,
    case when p_anonymous then null else nullif(trim(p_contact_phone), '') end,
    case when p_anonymous then false else coalesce(p_wants_callback, false) end
  )
  returning id into v_id;

  if p_anonymous then
    insert into public.feedback_anonymous_owners (feedback_id, parent_id) values (v_id, v_uid);
  end if;
  return v_id;
end;
$$;

-- Đổi trạng thái → ghi mốc
create or replace function public.feedback_touch_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists feedback_touch_status on public.feedback;
create trigger feedback_touch_status before update on public.feedback
  for each row execute function public.feedback_touch_status();

-- Thông báo cho phụ huynh: khi trả lời (như cũ) VÀ khi đổi trạng thái. Ẩn danh → người nhận lấy từ bảng chủ sở hữu.
create or replace function public.feedback_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_recipient uuid;
  v_title     text;
  v_body      text;
  v_reply_changed  boolean := new.admin_reply is not null and trim(new.admin_reply) <> ''
                              and (tg_op = 'INSERT' or new.admin_reply is distinct from old.admin_reply);
  v_status_changed boolean := tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'new';
begin
  if not v_reply_changed and not v_status_changed then
    return new;
  end if;

  v_recipient := coalesce(new.parent_id, (select o.parent_id from public.feedback_anonymous_owners o where o.feedback_id = new.id));
  if v_recipient is null then
    return new;
  end if;

  if v_reply_changed then
    v_title := case when new.status = 'resolved' then 'Nhà trường đã trả lời & hoàn tất góp ý của anh/chị'
                    else 'Nhà trường đã trả lời góp ý của anh/chị' end;
    v_body := trim(new.admin_reply);
  elsif new.status = 'in_progress' then
    v_title := 'Góp ý của anh/chị đang được giải quyết';
    v_body := 'Ban Giám đốc đã tiếp nhận: “' || left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 100) || '”';
  else
    v_title := 'Góp ý của anh/chị đã được xử lý xong';
    v_body := coalesce(nullif(trim(new.admin_reply), ''), 'Cảm ơn anh/chị đã đồng hành cùng TH EDU.');
  end if;
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;

  insert into public.notifications (recipient_id, student_id, feedback_id, type, ref_date, title, body)
  values (v_recipient, new.student_id, new.id, 'feedback'::text::public.notification_type,
          (now() at time zone 'Asia/Ho_Chi_Minh')::date, v_title, v_body)
  on conflict (feedback_id) where feedback_id is not null do update
    set title      = excluded.title,
        body       = excluded.body,
        ref_date   = excluded.ref_date,
        read_at    = null,
        pushed_at  = null,
        created_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_reply_notify on public.feedback;
create trigger feedback_reply_notify
  after insert or update of admin_reply, status on public.feedback
  for each row execute function public.feedback_reply_notify();

-- Thông báo hoạt động cho quản trị viên. Ẩn danh → ghi thẳng, không gắn người gửi
-- (admin_feed_push bỏ qua sự kiện không có người thực hiện; vai trò 'system' có từ apply-bank-reconcile.sql).
create or replace function public.admin_feed_feedback()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind  text := case new.kind when 'bao_loi' then 'Báo lỗi' when 'thac_mac' then 'Thắc mắc' else 'Góp ý' end;
  v_body  text := left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 160);
begin
  begin
    if new.is_anonymous then
      insert into public.admin_notifications (category, actor_id, actor_role, actor_name, title, body, href)
      values ('feedback', null, 'system', 'Phụ huynh (ẩn danh)', v_kind || ' ẩn danh', v_body, '/admin/feedback');
    else
      perform public.admin_feed_push(
        'feedback', new.parent_id, null,
        v_kind || ' mới từ phụ huynh' || case when new.wants_callback then ' · muốn được gọi lại' else '' end,
        v_body, '/admin/feedback'
      );
    end if;
  exception when others then raise warning 'admin_feed_feedback: %', sqlerrm;
  end;
  return new;
end;
$$;

-- =============================================================================
-- B. KHẢO SÁT HÀI LÒNG ĐỊNH KỲ
-- =============================================================================
create table if not exists public.satisfaction_surveys (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null references public.profiles (id) on delete cascade,
  period           date not null,                 -- ngày đầu tháng được khảo sát
  status           text not null default 'answered',
  rating           smallint,
  subject_ratings  jsonb not null default '{}'::jsonb,  -- {"tien_tieu_hoc": 1..5, "luyen_chu": .., "toan_tu_duy": ..}
  comment          text,
  campuses         text[] not null default '{}',  -- ảnh chụp cơ sở / lớp lúc trả lời (thống kê theo cơ sở)
  class_names      text[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint satisfaction_surveys_once_per_month unique (parent_id, period),
  constraint satisfaction_surveys_period_month check (extract(day from period) = 1),
  constraint satisfaction_surveys_status check (status in ('answered', 'declined')),
  constraint satisfaction_surveys_rating check (
    (status = 'declined' and rating is null) or (status = 'answered' and rating between 1 and 5)
  ),
  constraint satisfaction_surveys_subjects check (jsonb_typeof(subject_ratings) = 'object'),
  constraint satisfaction_surveys_comment check (comment is null or length(comment) <= 500)
);
create index if not exists satisfaction_surveys_period_idx on public.satisfaction_surveys (period, status);

alter table public.satisfaction_surveys enable row level security;
revoke all on public.satisfaction_surveys from anon;

drop policy if exists "surveys_parent_insert" on public.satisfaction_surveys;
create policy "surveys_parent_insert" on public.satisfaction_surveys
  for insert to authenticated
  with check (parent_id = (select auth.uid()) and public.current_user_role() = 'parent');

drop policy if exists "surveys_parent_select" on public.satisfaction_surveys;
create policy "surveys_parent_select" on public.satisfaction_surveys
  for select to authenticated
  using (parent_id = (select auth.uid()));

drop policy if exists "surveys_admin_select" on public.satisfaction_surveys;
create policy "surveys_admin_select" on public.satisfaction_surveys
  for select to authenticated
  using ((select public.is_admin()));

-- Trước khi lưu: chỉ giữ điểm môn hợp lệ (1–5, đúng 3 môn), chụp cơ sở / lớp của các con
create or replace function public.satisfaction_survey_prepare()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.subject_ratings := coalesce((
    select jsonb_object_agg(key, value)
    from jsonb_each(new.subject_ratings)
    where key in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy')
      and jsonb_typeof(value) = 'number' and (value::text)::numeric between 1 and 5
  ), '{}'::jsonb);
  if new.status = 'declined' then
    new.subject_ratings := '{}'::jsonb;
    new.comment := null;
  end if;
  new.comment := nullif(trim(new.comment), '');
  select coalesce(array_agg(distinct s.campus::text), '{}'), coalesce(array_agg(distinct s.class_name), '{}')
    into new.campuses, new.class_names
    from public.students s where s.parent_id = new.parent_id;
  return new;
end;
$$;
drop trigger if exists satisfaction_survey_prepare on public.satisfaction_surveys;
create trigger satisfaction_survey_prepare before insert on public.satisfaction_surveys
  for each row execute function public.satisfaction_survey_prepare();

-- Chấm thấp (≤ 2 sao) → báo ngay quản trị viên để chăm sóc phụ huynh
create or replace function public.satisfaction_survey_alert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'answered' and new.rating <= 2 then
    begin
      perform public.admin_feed_push(
        'feedback', new.parent_id, null,
        'Khảo sát hài lòng: phụ huynh chấm ' || new.rating || '★',
        coalesce(left(new.comment, 160), 'Không kèm nhận xét') || ' · ' || array_to_string(new.class_names, ', '),
        '/admin/feedback?tab=survey'
      );
    exception when others then raise warning 'satisfaction_survey_alert: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists satisfaction_survey_alert on public.satisfaction_surveys;
create trigger satisfaction_survey_alert after insert on public.satisfaction_surveys
  for each row execute function public.satisfaction_survey_alert();

-- Quyền gọi hàm (đồng bộ với chính sách chung của migration bảo mật)
revoke execute on function public.submit_feedback(text, text, text, uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.submit_feedback(text, text, text, uuid, boolean, text, text, boolean) to authenticated;
revoke execute on function public.feedback_is_anonymous(uuid) from public, anon;
grant execute on function public.feedback_is_anonymous(uuid) to authenticated;
revoke execute on function public.feedback_touch_status() from public, anon, authenticated;
revoke execute on function public.satisfaction_survey_prepare() from public, anon, authenticated;
revoke execute on function public.satisfaction_survey_alert() from public, anon, authenticated;

commit;
