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
