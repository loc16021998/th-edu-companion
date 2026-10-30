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
