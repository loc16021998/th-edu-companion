-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Đơn xin nghỉ học, chat phụ huynh–giáo viên, Web Push. Chạy SAU apply-admin-center.sql. Chạy lại vẫn an toàn.
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
