-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Đặt lịch hẹn trao đổi phụ huynh – giáo viên – Ban quản lý (khung giờ rảnh, xác nhận, quản trị lên lịch, nhắc trước 30 phút).
-- Đã chạy bản cũ → tự nâng cấp, giữ nguyên dữ liệu. Chạy lại vẫn an toàn.
-- =============================================================================
-- Đặt lịch hẹn trao đổi (Office Hours) — phụ huynh ↔ giáo viên chủ nhiệm ↔ Ban quản lý (quản trị viên).
--
--  Mỗi lịch hẹn có NGƯỜI CHỦ TRÌ (host: giáo viên hoặc quản trị viên) và KHÁCH (guest: phụ huynh hoặc giáo viên):
--    phụ huynh → giáo viên chủ nhiệm của bé · phụ huynh → quản trị viên · giáo viên → quản trị viên.
--
--  A. consultation_availability: khung giờ rảnh HẰNG TUẦN của người chủ trì (vd. Thứ 7 16:00–17:30, chia ô 30 phút,
--     trực tuyến / tại trung tâm / gọi điện). Khung của quản trị viên chọn đối tượng: phụ huynh / giáo viên / cả hai;
--     khung của giáo viên luôn dành cho phụ huynh lớp mình chủ nhiệm.
--  B. consultation_bookings: lịch hẹn. Chỉ tạo / đổi trạng thái qua RPC (kiểm tra quyền, khung giờ, chống trùng):
--       book_consultation()            — khách đặt 1 ô trống (≥ 2 giờ trước giờ hẹn, trong 30 ngày, tối đa 2 lịch sắp tới / người chủ trì)
--       admin_schedule_consultation()  — quản trị viên chủ động lên lịch (với phụ huynh / giáo viên, hoặc sắp xếp giáo viên ↔ phụ huynh),
--                                        không cần khung giờ, xác nhận ngay
--       decide_consultation()          — người chủ trì (hoặc quản trị viên) xác nhận / từ chối
--       cancel_consultation()          — người chủ trì, khách hoặc quản trị viên huỷ lịch chưa diễn ra
--     Chỉ số duy nhất (host_id, starts_at) với lịch đang chờ / đã xác nhận → không thể đặt trùng 1 ô.
--  C. consultation_slots(), consultation_hosts(): ô giờ (trống / đã có người đặt — không lộ ai đặt) và người chủ trì khách được đặt.
--  D. Thông báo: lịch mới → người chủ trì (+ bảng tin quản trị); xác nhận / từ chối / huỷ → các bên còn lại.
--  E. send_consultation_reminders(): nhắc CẢ HAI BÊN trước giờ hẹn ~30 phút. pg_cron chạy mỗi 5 phút
--     (không bật được pg_cron → gọi /api/cron/consultation-reminders từ cron ngoài). Thông báo mới tự được đẩy push.
--
-- Đã chạy bản cũ (teacher_availability, teacher_id/parent_id) → tự đổi tên sang cấu trúc mới, giữ nguyên dữ liệu.
-- Cần đã chạy: apply-leave-chat-push.sql (chat_allowed, pushed_at), apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

alter type public.notification_type add value if not exists 'booking_requested';
alter type public.notification_type add value if not exists 'booking_decided';
alter type public.notification_type add value if not exists 'booking_reminder';

begin;

-- -----------------------------------------------------------------------------
-- 0. Nâng cấp từ bản đầu (chỉ giáo viên ↔ phụ huynh)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.teacher_availability') is not null and to_regclass('public.consultation_availability') is null then
    alter table public.teacher_availability rename to consultation_availability;
    alter table public.consultation_availability rename column teacher_id to host_id;
    drop policy if exists "teacher_availability_select" on public.consultation_availability;
    drop policy if exists "teacher_availability_own_write" on public.consultation_availability;
    drop trigger if exists teacher_availability_touch on public.consultation_availability;
    alter index if exists public.teacher_availability_teacher_idx rename to consultation_availability_host_idx;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'consultation_bookings' and column_name = 'teacher_id') then
    alter table public.consultation_bookings rename column teacher_id to host_id;
    alter table public.consultation_bookings rename column parent_id to guest_id;
    alter table public.consultation_bookings rename column teacher_note to host_note;
    alter index if exists public.consultation_bookings_teacher_idx rename to consultation_bookings_host_idx;
    alter index if exists public.consultation_bookings_parent_idx rename to consultation_bookings_guest_idx;
  end if;
end $$;
drop function if exists public.consultation_slots(uuid, date, date);
drop function if exists public.consultation_teachers(uuid);
drop function if exists public.book_consultation(uuid, uuid, timestamptz, text);

-- Giáo viên chủ nhiệm của bé: phụ trách RIÊNG lớp của bé; lớp chưa có cô riêng → cô phụ trách cả cơ sở (như chat_allowed)
create or replace function public.is_homeroom_teacher(p_student_id uuid, p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_assignments ta on ta.teacher_id = p_teacher_id and ta.campus = s.campus
    join public.profiles t on t.id = ta.teacher_id and t.role = 'teacher'
    where s.id = p_student_id
      and (
        ta.class_name = s.class_name
        or (ta.class_name is null and not exists (
          select 1 from public.teacher_assignments x where x.campus = s.campus and x.class_name = s.class_name
        ))
      )
  );
$$;
revoke execute on function public.is_homeroom_teacher(uuid, uuid) from public, anon;
grant execute on function public.is_homeroom_teacher(uuid, uuid) to authenticated;

-- "Thứ 7 01/11 · 16:00–16:30" (giờ Việt Nam)
create or replace function public.vn_slot_label(p_starts timestamptz, p_ends timestamptz)
returns text
language sql stable set search_path = ''
as $$
  select case extract(isodow from (p_starts at time zone 'Asia/Ho_Chi_Minh'))::int
           when 7 then 'Chủ nhật' else 'Thứ ' || (extract(isodow from (p_starts at time zone 'Asia/Ho_Chi_Minh'))::int + 1) end
    || ' ' || to_char(p_starts at time zone 'Asia/Ho_Chi_Minh', 'DD/MM')
    || ' · ' || to_char(p_starts at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')
    || '–' || to_char(p_ends at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');
$$;

-- Người dùng hiện tại có được đặt khung giờ (đối tượng `p_audience`) của người chủ trì này không?
--   giáo viên chủ trì → phụ huynh có con trong lớp cô chủ nhiệm; quản trị viên chủ trì → phụ huynh / giáo viên theo đối tượng.
create or replace function public.consult_window_visible(p_host_id uuid, p_audience text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid, public.current_user_role()::text as role),
       host as (select p.role::text as role from public.profiles p where p.id = p_host_id)
  select coalesce((
    select me.uid = p_host_id
      or me.role = 'admin'
      or (host.role = 'teacher' and me.role = 'parent' and public.chat_allowed(me.uid, p_host_id))
      or (host.role = 'admin' and me.role = 'parent' and p_audience in ('parents', 'all'))
      or (host.role = 'admin' and me.role = 'teacher' and p_audience in ('teachers', 'all'))
    from me, host
  ), false);
$$;
revoke execute on function public.consult_window_visible(uuid, text) from public, anon;
grant execute on function public.consult_window_visible(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A. Khung giờ rảnh hằng tuần
-- -----------------------------------------------------------------------------
create table if not exists public.consultation_availability (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  weekday       smallint not null,
  start_time    time not null,
  end_time      time not null,
  slot_minutes  smallint not null default 30,
  mode          text not null default 'online',
  meeting_url   text,
  location      text,
  audience      text not null default 'parents',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.consultation_availability add column if not exists audience text not null default 'parents';

alter table public.consultation_availability drop constraint if exists teacher_availability_weekday;
alter table public.consultation_availability drop constraint if exists teacher_availability_slot;
alter table public.consultation_availability drop constraint if exists teacher_availability_range;
alter table public.consultation_availability drop constraint if exists teacher_availability_mode;
alter table public.consultation_availability drop constraint if exists teacher_availability_text;
alter table public.consultation_availability drop constraint if exists consultation_availability_valid;
alter table public.consultation_availability add constraint consultation_availability_valid check (
  weekday between 1 and 7
  and slot_minutes in (15, 20, 30, 45, 60)
  and end_time > start_time and extract(epoch from (end_time - start_time)) / 60 >= slot_minutes
  and start_time >= time '06:00' and end_time <= time '22:00'
  and mode in ('online', 'in_person', 'phone')
  and audience in ('parents', 'teachers', 'all')
  and (meeting_url is null or (meeting_url ~ '^https://' and length(meeting_url) <= 300))
  and (location is null or length(location) <= 160)
);
create index if not exists consultation_availability_host_idx on public.consultation_availability (host_id, weekday);
comment on table public.consultation_availability is 'Khung giờ rảnh hằng tuần của giáo viên / quản trị viên để phụ huynh, giáo viên đặt lịch trao đổi.';

-- Người chủ trì chỉ là giáo viên / quản trị viên; khung của giáo viên luôn dành cho phụ huynh
create or replace function public.consultation_availability_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role::text into v_role from public.profiles p where p.id = new.host_id;
  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'Chỉ giáo viên hoặc quản trị viên mở được khung giờ hẹn.' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
    new.audience := 'parents';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists consultation_availability_guard on public.consultation_availability;
create trigger consultation_availability_guard before insert or update on public.consultation_availability
  for each row execute function public.consultation_availability_guard();
revoke execute on function public.consultation_availability_guard() from public, anon, authenticated;

alter table public.consultation_availability enable row level security;
revoke all on public.consultation_availability from anon;
grant select, insert, update, delete on public.consultation_availability to authenticated;
drop policy if exists "consultation_availability_select" on public.consultation_availability;
create policy "consultation_availability_select" on public.consultation_availability
  for select to authenticated
  using (host_id = (select auth.uid()) or (select public.is_admin()) or public.consult_window_visible(host_id, audience));
drop policy if exists "consultation_availability_write" on public.consultation_availability;
create policy "consultation_availability_write" on public.consultation_availability
  for all to authenticated
  using ((host_id = (select auth.uid()) and public.current_user_role() = 'teacher') or (select public.is_admin()))
  with check ((host_id = (select auth.uid()) and public.current_user_role() = 'teacher') or (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- B. Lịch hẹn
-- -----------------------------------------------------------------------------
create table if not exists public.consultation_bookings (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles (id) on delete cascade,
  guest_id        uuid not null references public.profiles (id) on delete cascade,
  student_id      uuid references public.students (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  mode            text not null,
  topic           text not null,
  status          text not null default 'pending',
  meeting_url     text,
  location        text,
  host_note       text,
  cancel_reason   text,
  cancelled_by    uuid references public.profiles (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  reminder_sent_at timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.consultation_bookings alter column student_id drop not null;
alter table public.consultation_bookings add column if not exists created_by uuid references public.profiles (id) on delete set null;
update public.consultation_bookings set created_by = guest_id where created_by is null;

alter table public.consultation_bookings drop constraint if exists consultation_bookings_time;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_mode;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_status;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_text;
alter table public.consultation_bookings drop constraint if exists consultation_bookings_valid;
alter table public.consultation_bookings add constraint consultation_bookings_valid check (
  ends_at > starts_at and ends_at - starts_at <= interval '3 hours'
  and host_id <> guest_id
  and mode in ('online', 'in_person', 'phone')
  and status in ('pending', 'confirmed', 'declined', 'cancelled')
  and length(topic) between 5 and 500
  and (host_note is null or length(host_note) <= 300)
  and (cancel_reason is null or length(cancel_reason) <= 300)
  and (meeting_url is null or (meeting_url ~ '^https://' and length(meeting_url) <= 300))
  and (location is null or length(location) <= 160)
);
-- Chống đặt trùng: 1 ô giờ của 1 người chủ trì chỉ có 1 lịch đang chờ / đã xác nhận
drop index if exists public.consultation_bookings_slot_taken;
create unique index consultation_bookings_slot_taken
  on public.consultation_bookings (host_id, starts_at) where status in ('pending', 'confirmed');
create index if not exists consultation_bookings_host_idx on public.consultation_bookings (host_id, starts_at desc);
create index if not exists consultation_bookings_guest_idx on public.consultation_bookings (guest_id, starts_at desc);
create index if not exists consultation_bookings_student_idx on public.consultation_bookings (student_id);
create index if not exists consultation_bookings_starts_idx on public.consultation_bookings (starts_at desc);
create index if not exists consultation_bookings_reminder_idx
  on public.consultation_bookings (starts_at) where status = 'confirmed' and reminder_sent_at is null;
comment on table public.consultation_bookings is
  'Lịch hẹn trao đổi: người chủ trì (giáo viên / quản trị viên) ↔ khách (phụ huynh / giáo viên). Ghi qua RPC.';

alter table public.consultation_bookings enable row level security;
revoke all on public.consultation_bookings from anon, authenticated;
grant select on public.consultation_bookings to authenticated;
drop policy if exists "consultation_bookings_select" on public.consultation_bookings;
create policy "consultation_bookings_select" on public.consultation_bookings
  for select to authenticated
  using (host_id = (select auth.uid()) or guest_id = (select auth.uid()) or (select public.is_admin()));

-- Tên + vai trò 2 bên của các lịch hẹn mình tham gia (phụ huynh không đọc được hồ sơ quản trị viên qua RLS thường)
create or replace function public.consultation_parties(p_booking_ids uuid[])
returns table (booking_id uuid, host_name text, host_role text, guest_name text, guest_role text, creator_role text)
language sql stable security definer set search_path = ''
as $$
  select b.id, h.full_name, h.role::text, g.full_name, g.role::text, c.role::text
  from public.consultation_bookings b
  join public.profiles h on h.id = b.host_id
  join public.profiles g on g.id = b.guest_id
  left join public.profiles c on c.id = b.created_by
  where b.id = any(p_booking_ids)
    and (b.host_id = (select auth.uid()) or b.guest_id = (select auth.uid()) or (select public.is_admin()));
$$;
revoke execute on function public.consultation_parties(uuid[]) from public, anon;
grant execute on function public.consultation_parties(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- C. Ô giờ của 1 người chủ trì (tối đa 31 ngày) — chỉ khung người gọi được đặt, ô còn cách hiện tại ≥ 2 giờ
-- -----------------------------------------------------------------------------
create or replace function public.consultation_slots(p_host_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz, mode text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_to < p_from or p_to - p_from > 31 then
    return;
  end if;

  return query
    with slots as (
      select
        ((d::date + a.start_time + make_interval(mins => n * a.slot_minutes)) at time zone 'Asia/Ho_Chi_Minh') as s,
        a.slot_minutes,
        a.mode
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
      join public.consultation_availability a
        on a.host_id = p_host_id and a.active and a.weekday = extract(isodow from d)::int
      cross join lateral generate_series(0, (extract(epoch from (a.end_time - a.start_time)) / 60 / a.slot_minutes)::int - 1) n
      where public.consult_window_visible(a.host_id, a.audience)
    )
    select distinct on (sl.s)
      sl.s,
      sl.s + make_interval(mins => sl.slot_minutes::int),
      sl.mode,
      not exists (
        select 1 from public.consultation_bookings b
        where b.host_id = p_host_id and b.status in ('pending', 'confirmed')
          and b.starts_at < sl.s + make_interval(mins => sl.slot_minutes::int) and b.ends_at > sl.s
      )
    from slots sl
    where sl.s >= now() + interval '2 hours'
    order by sl.s, sl.slot_minutes;
end;
$$;
revoke execute on function public.consultation_slots(uuid, date, date) from public, anon;
grant execute on function public.consultation_slots(uuid, date, date) to authenticated;

-- Người chủ trì khách được đặt lịch:
--   phụ huynh (kèm bé) → giáo viên chủ nhiệm của bé + quản trị viên có khung cho phụ huynh;
--   giáo viên → quản trị viên có khung cho giáo viên.
create or replace function public.consultation_hosts(p_student_id uuid default null)
returns table (host_id uuid, full_name text, host_role text, has_availability boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid, public.current_user_role()::text as role)
  select t.id, t.full_name, 'teacher',
    exists (select 1 from public.consultation_availability a where a.host_id = t.id and a.active)
  from me, public.profiles t
  where me.role = 'parent' and t.role = 'teacher'
    and p_student_id is not null and public.is_parent_of(p_student_id)
    and public.is_homeroom_teacher(p_student_id, t.id)
  union all
  select a.id, a.full_name, 'admin', true
  from me, public.profiles a
  where a.role = 'admin'
    and ((me.role = 'parent' and p_student_id is not null and public.is_parent_of(p_student_id)) or me.role = 'teacher')
    and exists (
      select 1 from public.consultation_availability w
      where w.host_id = a.id and w.active
        and w.audience in ('all', case when me.role = 'parent' then 'parents' else 'teachers' end)
    )
  order by 3 desc, 2;
$$;
revoke execute on function public.consultation_hosts(uuid) from public, anon;
grant execute on function public.consultation_hosts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: đặt / lên lịch / xác nhận / huỷ
-- -----------------------------------------------------------------------------
create or replace function public.book_consultation(p_host_id uuid, p_starts_at timestamptz, p_topic text, p_student_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_role      text := public.current_user_role()::text;
  v_host_role text;
  v_topic     text := btrim(coalesce(p_topic, ''));
  v_slot      record;
  v_avail     record;
  v_id        uuid;
begin
  select p.role::text into v_host_role from public.profiles p where p.id = p_host_id;
  if v_uid is null or v_role not in ('parent', 'teacher') then
    raise exception 'Quản trị viên dùng chức năng "Lên lịch hẹn" trong trang quản trị.' using errcode = 'P0001';
  end if;
  if v_host_role is null or v_host_role not in ('teacher', 'admin') or p_host_id = v_uid then
    raise exception 'Không tìm thấy người nhận lịch hẹn.' using errcode = 'P0001';
  end if;
  if v_role = 'parent' then
    if p_student_id is null or not public.is_parent_of(p_student_id) then
      raise exception 'Không tìm thấy bé trong tài khoản của anh/chị.' using errcode = 'P0001';
    end if;
    if v_host_role = 'teacher' and not public.is_homeroom_teacher(p_student_id, p_host_id) then
      raise exception 'Cô không phụ trách lớp của bé — vui lòng chọn giáo viên chủ nhiệm của bé.' using errcode = 'P0001';
    end if;
  else
    if v_host_role <> 'admin' then
      raise exception 'Giáo viên chỉ đặt lịch hẹn với Ban quản lý trung tâm.' using errcode = 'P0001';
    end if;
    if p_student_id is not null and not public.teacher_can_access_student(p_student_id) then
      raise exception 'Bạn không phụ trách học sinh này.' using errcode = 'P0001';
    end if;
  end if;
  if length(v_topic) < 5 or length(v_topic) > 500 then
    raise exception 'Nội dung muốn trao đổi cần từ 5 đến 500 ký tự.' using errcode = 'P0001';
  end if;
  if p_starts_at > now() + interval '30 days' then
    raise exception 'Chỉ đặt được lịch trong 30 ngày tới.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.consultation_bookings b
      where b.guest_id = v_uid and b.host_id = p_host_id and b.status in ('pending', 'confirmed') and b.starts_at > now()) >= 2 then
    raise exception 'Anh/chị đang có 2 lịch hẹn sắp tới với người này — vui lòng chờ trao đổi xong hoặc huỷ bớt 1 lịch.' using errcode = 'P0001';
  end if;

  select * into v_slot
  from public.consultation_slots(p_host_id, (p_starts_at at time zone 'Asia/Ho_Chi_Minh')::date, (p_starts_at at time zone 'Asia/Ho_Chi_Minh')::date) s
  where s.starts_at = p_starts_at;
  if not found then
    raise exception 'Khung giờ này không còn mở (đã đổi lịch hoặc đã quá hạn đặt). Vui lòng chọn giờ khác.' using errcode = 'P0001';
  end if;
  if not v_slot.available then
    raise exception 'Khung giờ này vừa có người khác đặt. Vui lòng chọn giờ khác.' using errcode = 'P0001';
  end if;

  -- Link họp / địa điểm mặc định của khung giờ
  select a.meeting_url, a.location into v_avail
  from public.consultation_availability a
  where a.host_id = p_host_id and a.active
    and a.weekday = extract(isodow from (p_starts_at at time zone 'Asia/Ho_Chi_Minh'))::int
    and (p_starts_at at time zone 'Asia/Ho_Chi_Minh')::time >= a.start_time
    and (p_starts_at at time zone 'Asia/Ho_Chi_Minh')::time < a.end_time
    and public.consult_window_visible(a.host_id, a.audience)
  order by a.slot_minutes
  limit 1;

  begin
    insert into public.consultation_bookings (host_id, guest_id, student_id, starts_at, ends_at, mode, topic, meeting_url, location, created_by)
    values (p_host_id, v_uid, p_student_id, v_slot.starts_at, v_slot.ends_at, v_slot.mode, v_topic, v_avail.meeting_url, v_avail.location, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Khung giờ này vừa có người khác đặt. Vui lòng chọn giờ khác.' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;
revoke execute on function public.book_consultation(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.book_consultation(uuid, timestamptz, text, uuid) to authenticated;

-- Quản trị viên chủ động lên lịch (đã xác nhận ngay): chính mình hoặc 1 giáo viên chủ trì; khách là phụ huynh hoặc giáo viên.
create or replace function public.admin_schedule_consultation(
  p_host_id uuid, p_guest_id uuid, p_student_id uuid, p_starts_at timestamptz, p_minutes integer,
  p_mode text, p_topic text, p_meeting_url text default null, p_location text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_host_role  text;
  v_guest_role text;
  v_ends       timestamptz := p_starts_at + make_interval(mins => coalesce(p_minutes, 0));
  v_topic      text := btrim(coalesce(p_topic, ''));
  v_url        text := nullif(btrim(coalesce(p_meeting_url, '')), '');
  v_busy       text;
  v_id         uuid;
begin
  if v_uid is null or not (select public.is_admin()) then
    raise exception 'Chỉ quản trị viên được lên lịch hẹn trực tiếp.' using errcode = 'P0001';
  end if;
  select p.role::text into v_host_role from public.profiles p where p.id = p_host_id;
  select p.role::text into v_guest_role from public.profiles p where p.id = p_guest_id;
  if v_host_role is null or v_host_role not in ('teacher', 'admin') then
    raise exception 'Người chủ trì phải là giáo viên hoặc quản trị viên.' using errcode = 'P0001';
  end if;
  if v_guest_role is null or v_guest_role not in ('parent', 'teacher') or p_guest_id = p_host_id then
    raise exception 'Người được mời phải là phụ huynh hoặc giáo viên.' using errcode = 'P0001';
  end if;
  if v_guest_role = 'teacher' and v_host_role <> 'admin' then
    raise exception 'Lịch hẹn với giáo viên do quản trị viên chủ trì.' using errcode = 'P0001';
  end if;
  if v_guest_role = 'parent' and (p_student_id is null or not exists (select 1 from public.students s where s.id = p_student_id and s.parent_id = p_guest_id)) then
    raise exception 'Chọn bé của phụ huynh này để ghi vào lịch hẹn.' using errcode = 'P0001';
  end if;
  if coalesce(p_minutes, 0) not between 10 and 180 then
    raise exception 'Thời lượng từ 10 đến 180 phút.' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() or p_starts_at > now() + interval '90 days' then
    raise exception 'Giờ hẹn phải trong tương lai và trong 90 ngày tới.' using errcode = 'P0001';
  end if;
  if coalesce(p_mode, '') not in ('online', 'in_person', 'phone') then
    raise exception 'Hình thức không hợp lệ.' using errcode = 'P0001';
  end if;
  if length(v_topic) < 5 or length(v_topic) > 500 then
    raise exception 'Nội dung trao đổi cần từ 5 đến 500 ký tự.' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'Link họp phải bắt đầu bằng https://' using errcode = 'P0001';
  end if;

  -- Không chồng giờ với lịch khác của người chủ trì hoặc người được mời
  select coalesce(p.full_name, '') into v_busy
  from public.consultation_bookings b
  join public.profiles p on p.id = case when b.host_id in (p_host_id, p_guest_id) then b.host_id else b.guest_id end
  where b.status in ('pending', 'confirmed')
    and (b.host_id in (p_host_id, p_guest_id) or b.guest_id in (p_host_id, p_guest_id))
    and b.starts_at < v_ends and b.ends_at > p_starts_at
  limit 1;
  if found then
    raise exception '% đã có lịch hẹn trùng giờ này. Vui lòng chọn giờ khác.', v_busy using errcode = 'P0001';
  end if;

  insert into public.consultation_bookings (host_id, guest_id, student_id, starts_at, ends_at, mode, topic, status, meeting_url, location, created_by, decided_at)
  values (p_host_id, p_guest_id, p_student_id, p_starts_at, v_ends, p_mode, v_topic, 'confirmed',
          case when p_mode = 'online' then v_url end,
          case when p_mode = 'in_person' then left(nullif(btrim(coalesce(p_location, '')), ''), 160) end,
          v_uid, now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_schedule_consultation(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) from public, anon;
grant execute on function public.admin_schedule_consultation(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) to authenticated;

create or replace function public.decide_consultation(p_id uuid, p_confirm boolean, p_note text default null, p_meeting_url text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_b    public.consultation_bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_url  text := nullif(btrim(coalesce(p_meeting_url, '')), '');
begin
  select * into v_b from public.consultation_bookings where id = p_id for update;
  if not found or not (v_b.host_id = v_uid or (select public.is_admin())) then
    raise exception 'Không tìm thấy lịch hẹn.' using errcode = 'P0001';
  end if;
  if v_b.status <> 'pending' then
    raise exception 'Lịch hẹn đã được xử lý.' using errcode = 'P0001';
  end if;
  if v_b.starts_at <= now() then
    raise exception 'Lịch hẹn đã quá giờ.' using errcode = 'P0001';
  end if;
  if not p_confirm and v_note is null then
    raise exception 'Vui lòng ghi lý do để người đặt chọn giờ khác.' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'Link họp phải bắt đầu bằng https://' using errcode = 'P0001';
  end if;

  update public.consultation_bookings
  set status = case when p_confirm then 'confirmed' else 'declined' end,
      host_note = v_note,
      meeting_url = coalesce(v_url, meeting_url),
      decided_at = now()
  where id = p_id;
end;
$$;
revoke execute on function public.decide_consultation(uuid, boolean, text, text) from public, anon;
grant execute on function public.decide_consultation(uuid, boolean, text, text) to authenticated;

create or replace function public.cancel_consultation(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_b   public.consultation_bookings;
begin
  select * into v_b from public.consultation_bookings where id = p_id for update;
  if not found or not (v_b.guest_id = v_uid or v_b.host_id = v_uid or (select public.is_admin())) then
    raise exception 'Không tìm thấy lịch hẹn.' using errcode = 'P0001';
  end if;
  if v_b.status not in ('pending', 'confirmed') then
    raise exception 'Lịch hẹn đã được xử lý.' using errcode = 'P0001';
  end if;
  if v_b.starts_at <= now() then
    raise exception 'Lịch hẹn đã bắt đầu, không huỷ được nữa.' using errcode = 'P0001';
  end if;

  update public.consultation_bookings
  set status = 'cancelled', cancelled_by = v_uid, cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
  where id = p_id;
end;
$$;
revoke execute on function public.cancel_consultation(uuid, text) from public, anon;
grant execute on function public.cancel_consultation(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- D. Thông báo
-- -----------------------------------------------------------------------------
create or replace function public.consultation_upsert_notification(
  p_recipient uuid, p_student uuid, p_type text, p_ref uuid, p_title text, p_body text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, student_id, type, ref_date, ref_id, title, body)
  values (p_recipient, p_student, p_type::public.notification_type, (now() at time zone 'Asia/Ho_Chi_Minh')::date, p_ref, p_title, left(p_body, 500))
  on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
    set title = excluded.title, body = excluded.body, read_at = null, pushed_at = null, created_at = now();
end;
$$;
revoke execute on function public.consultation_upsert_notification(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;

-- "Cô Hường" / "Ban quản lý (Chị Mai)" / "phụ huynh bé An" / "GV Thầy Tú" — tên hiển thị của 1 bên trong lịch hẹn
create or replace function public.consultation_party_label(p_profile uuid, p_student uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case p.role::text
    when 'admin' then 'Ban quản lý (' || coalesce(p.full_name, '') || ')'
    when 'parent' then 'phụ huynh bé ' || coalesce((select public.given_name(s.full_name) from public.students s where s.id = p_student), coalesce(p.full_name, ''))
    when 'teacher' then coalesce(p.full_name, 'giáo viên')
    else coalesce(p.full_name, '')
  end
  from public.profiles p where p.id = p_profile;
$$;
revoke execute on function public.consultation_party_label(uuid, uuid) from public, anon, authenticated;

create or replace function public.consultation_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_host   text := public.consultation_party_label(new.host_id, new.student_id);
  v_guest  text := public.consultation_party_label(new.guest_id, new.student_id);
  v_when   text := public.vn_slot_label(new.starts_at, new.ends_at);
  v_mode   text := case new.mode when 'online' then 'Trực tuyến' when 'phone' then 'Gọi điện' else 'Tại trung tâm' end;
  v_detail text := v_when || ' · ' || v_mode;
  v_who    uuid;
begin
  begin
    if tg_op = 'INSERT' then
      if new.status = 'pending' then
        -- Khách đặt → người chủ trì xác nhận
        perform public.consultation_upsert_notification(
          new.host_id, new.student_id, 'booking_requested', new.id,
          '📅 Lịch hẹn mới: ' || v_guest,
          v_detail || ' · “' || left(new.topic, 160) || '”'
        );
        if to_regprocedure('public.admin_feed_push(text, uuid, text, text, text, text)') is not null then
          perform public.admin_feed_push('consultation', new.guest_id, 'consultation:' || new.host_id,
            'Lịch hẹn mới: ' || v_guest || ' → ' || v_host, v_detail || ' · ' || left(new.topic, 120), '/admin/consultations');
        end if;
      else
        -- Quản trị viên lên lịch → báo người được mời + người chủ trì (nếu không phải chính người tạo)
        perform public.consultation_upsert_notification(
          new.guest_id, new.student_id, 'booking_decided', new.id,
          '📅 Trung tâm đã đặt lịch hẹn với ' || v_host,
          v_detail || ' · “' || left(new.topic, 160) || '”'
        );
        if new.host_id is distinct from new.created_by then
          perform public.consultation_upsert_notification(
            new.host_id, new.student_id, 'booking_decided', new.id,
            '📅 Ban quản lý xếp lịch hẹn với ' || v_guest,
            v_detail || ' · “' || left(new.topic, 160) || '”'
          );
        end if;
      end if;
    elsif new.status is distinct from old.status then
      if new.status = 'confirmed' then
        perform public.consultation_upsert_notification(
          new.guest_id, new.student_id, 'booking_decided', new.id,
          '✅ ' || v_host || ' đã xác nhận lịch hẹn',
          v_detail
            || case when new.mode = 'online' and new.meeting_url is not null then ' · Link họp có trong mục lịch hẹn' else '' end
            || coalesce(' · ' || new.host_note, '')
        );
      elsif new.status = 'declined' then
        perform public.consultation_upsert_notification(
          new.guest_id, new.student_id, 'booking_decided', new.id,
          v_host || ' chưa thể nhận lịch hẹn ' || v_when,
          coalesce(new.host_note, '') || ' — anh/chị vui lòng chọn khung giờ khác.'
        );
      elsif new.status = 'cancelled' then
        foreach v_who in array array[new.host_id, new.guest_id]
        loop
          continue when v_who is not distinct from new.cancelled_by;
          perform public.consultation_upsert_notification(
            v_who, new.student_id, 'booking_decided', new.id,
            'Lịch hẹn ' || v_when || ' đã bị huỷ',
            case when new.cancelled_by = new.host_id then v_host || ' đã huỷ'
                 when new.cancelled_by = new.guest_id then v_guest || ' đã huỷ'
                 else 'Ban quản lý đã huỷ' end
              || coalesce('. Lý do: ' || new.cancel_reason, '') || '.'
          );
        end loop;
        if new.cancelled_by in (new.host_id, new.guest_id) and to_regprocedure('public.admin_feed_push(text, uuid, text, text, text, text)') is not null then
          perform public.admin_feed_push('consultation', new.cancelled_by, null,
            'Huỷ lịch hẹn ' || v_guest || ' → ' || v_host, v_detail || coalesce(' · Lý do: ' || new.cancel_reason, ''), '/admin/consultations');
        end if;
      end if;
    end if;
  exception when others then raise warning 'consultation_notify: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists consultation_notify on public.consultation_bookings;
create trigger consultation_notify after insert or update of status on public.consultation_bookings
  for each row execute function public.consultation_notify();
revoke execute on function public.consultation_notify() from public, anon, authenticated;

-- Bảng tin quản trị: thêm loại "Lịch hẹn"
do $$
begin
  if to_regclass('public.admin_notifications') is not null then
    alter table public.admin_notifications drop constraint if exists admin_notifications_category_valid;
    alter table public.admin_notifications add constraint admin_notifications_category_valid
      check (category in ('feedback', 'leave', 'chat', 'homework', 'daily_report', 'attendance', 'summary', 'payment', 'admissions', 'consultation'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- E. Nhắc lịch trước ~30 phút cho cả hai bên
-- -----------------------------------------------------------------------------
create or replace function public.send_consultation_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer := 0;
  r       record;
  v_when  text;
  v_how   text;
begin
  if v_uid is not null and not (select public.is_admin()) then
    raise exception 'Chỉ quản trị viên được chạy nhắc lịch hẹn' using errcode = '42501';
  end if;

  for r in
    select b.*
    from public.consultation_bookings b
    where b.status = 'confirmed' and b.reminder_sent_at is null
      and b.starts_at > now() and b.starts_at <= now() + interval '35 minutes'
    for update of b skip locked
  loop
    update public.consultation_bookings set reminder_sent_at = now() where id = r.id;
    v_when := to_char(r.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');
    v_how := case r.mode
      when 'online' then case when r.meeting_url is not null then 'Mở mục lịch hẹn để vào phòng họp trực tuyến.' else 'Trao đổi trực tuyến — link họp sẽ được gửi.' end
      when 'phone' then 'Trao đổi qua điện thoại.'
      else 'Gặp tại ' || coalesce(r.location, 'trung tâm') || '.'
    end;

    perform public.consultation_upsert_notification(
      r.guest_id, r.student_id, 'booking_reminder', r.id,
      '⏰ ' || v_when || ' hôm nay: lịch hẹn với ' || public.consultation_party_label(r.host_id, r.student_id),
      'Còn khoảng 30 phút. ' || v_how
    );
    perform public.consultation_upsert_notification(
      r.host_id, r.student_id, 'booking_reminder', r.id,
      '⏰ ' || v_when || ': hẹn trao đổi với ' || public.consultation_party_label(r.guest_id, r.student_id),
      'Còn khoảng 30 phút. ' || v_how || ' Nội dung: “' || left(r.topic, 160) || '”'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.send_consultation_reminders() from public, anon;
grant execute on function public.send_consultation_reminders() to authenticated;

-- Nhật ký thay đổi (apply-security-audit.sql) + dọn thông báo khi xoá lịch (apply-monitoring.sql)
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.consultation_bookings;
    create trigger audit_row_change after insert or update or delete on public.consultation_bookings
      for each row execute function public.audit_row_change();
  end if;
  if to_regprocedure('public.notifications_cleanup_ref()') is not null then
    drop trigger if exists notifications_cleanup_ref on public.consultation_bookings;
    create trigger notifications_cleanup_ref after delete on public.consultation_bookings
      for each row execute function public.notifications_cleanup_ref();
  end if;
end $$;

-- Báo cáo toàn vẹn: thông báo trỏ tới lịch hẹn là hợp lệ, không phải "mồ côi"
create or replace function public.notification_ref_exists(p_ref uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  t text;
  v_hit boolean;
begin
  foreach t in array array['announcements', 'homework_assignments', 'homework_submissions', 'moments', 'moment_comments', 'leave_requests', 'fees', 'trial_classes', 'campus_transfer_requests', 'consultation_bookings']
  loop
    continue when to_regclass('public.' || t) is null;
    execute format('select exists (select 1 from public.%I where id = $1)', t) into v_hit using p_ref;
    if v_hit then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke execute on function public.notification_ref_exists(uuid) from public, anon, authenticated;

commit;

-- Nhắc lịch mỗi 5 phút bằng pg_cron (không bật được → dùng /api/cron/consultation-reminders từ cron ngoài)
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Không bật được pg_cron: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('thedu-consultation-reminders') where exists (select 1 from cron.job where jobname = 'thedu-consultation-reminders');
      perform cron.schedule('thedu-consultation-reminders', '*/5 * * * *', 'select public.send_consultation_reminders()');
    exception when others then
      raise notice 'Không lập lịch được nhắc lịch hẹn: %', sqlerrm;
    end;
  end if;
end;
$$;
