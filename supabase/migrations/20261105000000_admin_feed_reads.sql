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
