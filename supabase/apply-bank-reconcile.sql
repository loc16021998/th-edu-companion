-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Tự động gạch nợ từ webhook ngân hàng (SePay / Casso). Chạy SAU apply-finance.sql và apply-admin-activity-feed.sql. Chạy lại vẫn an toàn.
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
