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
