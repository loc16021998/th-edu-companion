-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Gồm 2 migration mới (thông báo; lớp học + chấm công GV). Chỉ chạy MỘT lần.

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
