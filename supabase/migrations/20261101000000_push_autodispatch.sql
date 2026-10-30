-- =============================================================================
-- Tự động đẩy thông báo (Web Push / Zalo ZNS) cho MỌI thông báo mới — kể cả thông báo sinh ngoài app
-- (sửa trực tiếp trong SQL, trigger khác…), không cần tạo Database Webhook bằng tay.
--
-- Cơ chế: trigger mức câu lệnh trên `notifications` gọi pg_net (HTTP bất đồng bộ, không làm chậm giao dịch)
-- tới `<APP_URL>/api/push/dispatch` với `Authorization: Bearer <PUSH_DISPATCH_SECRET>`.
-- URL + mã bí mật lưu ở bảng `app_settings` (chỉ quản trị đọc/ghi) — bấm "Kết nối tự động" ở /admin/notifications-settings.
-- Chưa cấu hình → trigger không làm gì. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon;
drop policy if exists "admin_all_app_settings" on public.app_settings;
create policy "admin_all_app_settings" on public.app_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Một lần gọi cho mỗi câu lệnh (tạo học phí cho 200 bé = 1 lần gọi). Bỏ qua khi server tự đánh dấu pushed_at (tránh vòng lặp).
create or replace function public.notifications_autodispatch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from new_rows where pushed_at is null) then
    return null;
  end if;

  select value into v_url from public.app_settings where key = 'push_dispatch_url';
  select value into v_secret from public.app_settings where key = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      timeout_milliseconds := 10000
    );
  exception when others then
    -- Không bao giờ làm hỏng việc lưu điểm danh / sổ liên lạc vì lỗi gọi HTTP
    raise warning 'notifications_autodispatch: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifications_autodispatch_insert on public.notifications;
create trigger notifications_autodispatch_insert
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_autodispatch();

drop trigger if exists notifications_autodispatch_update on public.notifications;
create trigger notifications_autodispatch_update
  after update on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_autodispatch();
