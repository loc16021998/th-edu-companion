-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Điều hành trung tâm: thông báo chung, tạo học phí tháng, nhật ký thu tiền. Chạy SAU apply-homework.sql. Chạy lại vẫn an toàn.
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
