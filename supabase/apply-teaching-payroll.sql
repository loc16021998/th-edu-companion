-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Lịch dạy, chấm công theo ca (bắt đầu / kết thúc) và tính lương theo buổi cho giáo viên. Chạy lại vẫn an toàn.
-- =============================================================================
-- Lịch dạy, chấm công theo ca và tính lương theo buổi cho giáo viên.
--
--  - classes: thêm môn dạy chính (subject) + phòng học (room) → hiện trên lịch dạy, chọn đơn giá lương.
--  - teacher_pay_rates: đơn giá / buổi theo môn (teacher_id NULL = mặc định) và theo từng giáo viên (ghi đè).
--  - teaching_sessions: 1 ca dạy thực tế / giáo viên / lớp / ngày — giáo viên bấm "Bắt đầu ca dạy" / "Kết thúc ca dạy"
--    qua RPC teaching_check_in() / teaching_check_out(). DB tự lấy cơ sở + môn theo lớp (không nhầm cơ sở),
--    chặn mở 2 ca cùng lúc, ghi giờ thực tế, chốt đơn giá khi kết thúc ca, tự chấm "Có mặt / Đi muộn" ở teacher_attendance.
--  - Quản trị viên sửa / thêm / huỷ ca (quên bấm, dạy bù) trực tiếp trên bảng (RLS admin).
--  Lương tháng = Σ ca hợp lệ (completed / missed_checkout / manual) × đơn giá buổi theo môn.
--
-- Cần đã chạy: apply-security-audit.sql (nhật ký). Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Lớp: môn dạy + phòng học
-- -----------------------------------------------------------------------------
alter table public.classes add column if not exists subject text;
alter table public.classes add column if not exists room text;
alter table public.classes drop constraint if exists classes_subject_valid;
alter table public.classes add constraint classes_subject_valid
  check (subject is null or subject in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy'));
alter table public.classes drop constraint if exists classes_room_length;
alter table public.classes add constraint classes_room_length check (room is null or length(trim(room)) between 1 and 40);
comment on column public.classes.subject is 'Môn dạy chính của lớp (NULL = tổng hợp). Dùng chọn đơn giá lương theo buổi.';

-- -----------------------------------------------------------------------------
-- 2. Đơn giá lương theo buổi
-- -----------------------------------------------------------------------------
create table if not exists public.teacher_pay_rates (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  teacher_id  uuid references public.profiles (id) on delete cascade,
  rate        numeric(12, 0) not null,
  updated_at  timestamptz not null default now(),
  constraint teacher_pay_rates_subject_valid check (subject in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy', 'tong_hop')),
  constraint teacher_pay_rates_rate_range check (rate between 0 and 100000000)
);
create unique index if not exists teacher_pay_rates_unique on public.teacher_pay_rates (subject, teacher_id) nulls not distinct;
comment on table public.teacher_pay_rates is 'Đơn giá lương / buổi theo môn. teacher_id NULL = mặc định; có teacher_id = riêng giáo viên đó.';

-- -----------------------------------------------------------------------------
-- 3. Ca dạy thực tế
-- -----------------------------------------------------------------------------
create table if not exists public.teaching_sessions (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.profiles (id) on delete cascade,
  class_id         uuid references public.classes (id) on delete set null,
  campus           public.campus not null,
  class_name       text not null,
  subject          text not null default 'tong_hop',
  date             date not null,
  scheduled_start  time,
  scheduled_end    time,
  checked_in_at    timestamptz,
  checked_out_at   timestamptz,
  status           text not null default 'in_progress',
  off_schedule     boolean not null default false,
  rate             numeric(12, 0),
  note             text,
  adjusted_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint teaching_sessions_status_valid check (status in ('in_progress', 'completed', 'missed_checkout', 'manual', 'cancelled')),
  constraint teaching_sessions_subject_valid check (subject in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy', 'tong_hop')),
  constraint teaching_sessions_time_order check (checked_out_at is null or checked_in_at is null or checked_out_at >= checked_in_at),
  constraint teaching_sessions_note_length check (note is null or length(note) <= 300),
  constraint teaching_sessions_rate_range check (rate is null or rate between 0 and 100000000)
);
comment on table public.teaching_sessions is 'Ca dạy thực tế (bắt đầu / kết thúc) — cơ sở tính lương theo buổi.';
create unique index if not exists teaching_sessions_once_per_day on public.teaching_sessions (teacher_id, class_id, date) where status <> 'cancelled';
-- Không thể đang dạy 2 ca cùng lúc (tránh nhầm cơ sở)
create unique index if not exists teaching_sessions_one_open on public.teaching_sessions (teacher_id) where status = 'in_progress';
create index if not exists teaching_sessions_date_idx on public.teaching_sessions (date, teacher_id);

-- -----------------------------------------------------------------------------
-- 4. Quyền
-- -----------------------------------------------------------------------------
alter table public.teacher_pay_rates enable row level security;
alter table public.teaching_sessions enable row level security;
revoke all on public.teacher_pay_rates, public.teaching_sessions from anon;
grant select, insert, update, delete on public.teacher_pay_rates, public.teaching_sessions to authenticated;

drop policy if exists "admin_all_teacher_pay_rates" on public.teacher_pay_rates;
create policy "admin_all_teacher_pay_rates" on public.teacher_pay_rates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Giáo viên xem đơn giá mặc định + đơn giá riêng của mình (ước tính thu nhập)
drop policy if exists "teacher_pay_rates_select_own" on public.teacher_pay_rates;
create policy "teacher_pay_rates_select_own" on public.teacher_pay_rates
  for select to authenticated
  using ((select public.current_user_role()) = 'teacher' and (teacher_id is null or teacher_id = (select auth.uid())));

drop policy if exists "admin_all_teaching_sessions" on public.teaching_sessions;
create policy "admin_all_teaching_sessions" on public.teaching_sessions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Giáo viên chỉ XEM ca của mình; bắt đầu / kết thúc ca qua RPC
drop policy if exists "teaching_sessions_select_own" on public.teaching_sessions;
create policy "teaching_sessions_select_own" on public.teaching_sessions
  for select to authenticated
  using (teacher_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. Hàm & trigger
-- -----------------------------------------------------------------------------
drop trigger if exists teaching_sessions_touch on public.teaching_sessions;
create trigger teaching_sessions_touch before update on public.teaching_sessions
  for each row execute function public.touch_updated_at();
drop trigger if exists teacher_pay_rates_touch on public.teacher_pay_rates;
create trigger teacher_pay_rates_touch before update on public.teacher_pay_rates
  for each row execute function public.touch_updated_at();

-- Đơn giá hiệu lực: riêng giáo viên > mặc định của môn > mặc định "tổng hợp"
create or replace function public.teaching_rate_for(p_teacher uuid, p_subject text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select r.rate from public.teacher_pay_rates r
  where (r.subject = p_subject or r.subject = 'tong_hop') and (r.teacher_id = p_teacher or r.teacher_id is null)
    -- Chỉ quản trị viên hoặc chính giáo viên đó tra được đơn giá
    and (public.is_admin() or p_teacher = (select auth.uid()))
  order by (r.teacher_id is not null) desc, (r.subject = p_subject) desc
  limit 1;
$$;

-- Ca quên bấm "Kết thúc" từ ngày trước → đánh dấu để quản trị viên duyệt (vẫn tính buổi, chốt đơn giá)
create or replace function public.teaching_close_stale(p_teacher uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.teaching_sessions s
  set status = 'missed_checkout', rate = coalesce(s.rate, public.teaching_rate_for(s.teacher_id, s.subject))
  where s.teacher_id = p_teacher
    and s.status = 'in_progress'
    and s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create or replace function public.teaching_check_in(p_class uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_class  public.classes;
  v_shift  public.class_shifts;
  v_today  date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_now    time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  v_start  time := '18:00';
  v_end    time := '19:30';
  v_days   smallint[] := '{1,2,3,4,5,6}';
  v_off    boolean;
  v_open   public.teaching_sessions;
  v_id     uuid;
begin
  if v_uid is null or public.current_user_role() <> 'teacher' then
    raise exception 'Chỉ giáo viên được bắt đầu ca dạy' using errcode = '42501';
  end if;
  select * into v_class from public.classes where id = p_class;
  if v_class.id is null then
    raise exception 'Lớp không tồn tại' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.teacher_assignments a
    where a.teacher_id = v_uid and a.campus = v_class.campus and (a.class_name is null or a.class_name = v_class.name)
  ) then
    raise exception 'Bạn chưa được phân công dạy lớp % (%)', v_class.name,
      case v_class.campus when 'CS1_XALA' then 'CS1 Xa La' else 'CS2 Ngô Thì Nhậm' end using errcode = '42501';
  end if;

  perform public.teaching_close_stale(v_uid);

  select * into v_open from public.teaching_sessions where teacher_id = v_uid and status = 'in_progress';
  if v_open.id is not null then
    raise exception 'Bạn đang trong ca lớp % tại % — bấm “Kết thúc ca dạy” ca đó trước', v_open.class_name,
      case v_open.campus when 'CS1_XALA' then 'CS1 Xa La' else 'CS2 Ngô Thì Nhậm' end using errcode = '22023';
  end if;
  if exists (select 1 from public.teaching_sessions where teacher_id = v_uid and class_id = p_class and date = v_today and status <> 'cancelled') then
    raise exception 'Ca dạy lớp % hôm nay đã được ghi nhận', v_class.name using errcode = '23505';
  end if;

  if v_class.shift_id is not null then
    select * into v_shift from public.class_shifts where id = v_class.shift_id and is_active;
    if v_shift.id is not null then
      v_start := v_shift.start_time;
      v_end := v_shift.end_time;
      v_days := v_shift.weekdays;
    end if;
  end if;
  -- Ngoài lịch (dạy bù / đổi ca): vẫn cho bắt đầu nhưng phải ghi lý do, quản trị viên xem lại
  v_off := not (extract(isodow from v_today)::smallint = any (v_days))
           or v_now < v_start - interval '45 minutes'
           or v_now > v_end;
  if v_off and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Ngoài giờ ca học của lớp (% – %). Ghi lý do (vd: dạy bù) để bắt đầu ca', to_char(v_start, 'HH24:MI'), to_char(v_end, 'HH24:MI')
      using errcode = 'P0001', hint = 'need_note';
  end if;

  insert into public.teaching_sessions (teacher_id, class_id, campus, class_name, subject, date, scheduled_start, scheduled_end, checked_in_at, status, off_schedule, note)
  values (v_uid, v_class.id, v_class.campus, v_class.name, coalesce(v_class.subject, 'tong_hop'), v_today, v_start, v_end, now(), 'in_progress', v_off,
          nullif(left(trim(p_note), 300), ''))
  returning id into v_id;

  -- Chấm công ngày: Có mặt / Đi muộn (> 10 phút) — không ghi đè nếu quản trị viên đã chấm
  begin
    insert into public.teacher_attendance (teacher_id, date, status, note, recorded_by)
    values (v_uid, v_today,
            case when not v_off and v_now > v_start + interval '10 minutes' then 'late' else 'present' end::text::public.attendance_status,
            'Tự ghi khi bắt đầu ca ' || to_char(v_now, 'HH24:MI') || ' · Lớp ' || v_class.name, v_uid)
    on conflict (teacher_id, date) do nothing;
  exception when others then raise warning 'teaching_check_in attendance: %', sqlerrm;
  end;
  return v_id;
end;
$$;

create or replace function public.teaching_check_out(p_session uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s   public.teaching_sessions;
begin
  select * into v_s from public.teaching_sessions where id = p_session for update;
  if v_s.id is null or v_s.teacher_id <> v_uid then
    raise exception 'Không tìm thấy ca dạy' using errcode = 'P0002';
  end if;
  if v_s.status <> 'in_progress' then
    raise exception 'Ca dạy này đã kết thúc' using errcode = '22023';
  end if;
  update public.teaching_sessions
  set checked_out_at = now(), status = 'completed', rate = public.teaching_rate_for(v_s.teacher_id, v_s.subject)
  where id = p_session;
end;
$$;

-- Nhật ký thay đổi
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.teaching_sessions;
    create trigger audit_row_change after insert or update or delete on public.teaching_sessions
      for each row execute function public.audit_row_change();
    drop trigger if exists audit_row_change on public.teacher_pay_rates;
    create trigger audit_row_change after insert or update or delete on public.teacher_pay_rates
      for each row execute function public.audit_row_change();
  end if;
end $$;

revoke execute on function public.teaching_rate_for(uuid, text) from public, anon;
grant execute on function public.teaching_rate_for(uuid, text) to authenticated;
revoke execute on function public.teaching_close_stale(uuid) from public, anon, authenticated;
revoke execute on function public.teaching_check_in(uuid, text) from public, anon;
grant execute on function public.teaching_check_in(uuid, text) to authenticated;
revoke execute on function public.teaching_check_out(uuid) from public, anon;
grant execute on function public.teaching_check_out(uuid) to authenticated;

commit;
