-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Giám sát vận hành (nhật ký lỗi, health check) + toàn vẹn dữ liệu (index khoá ngoại, dọn thông báo / file mồ côi). Chạy lại vẫn an toàn.
-- =============================================================================
-- Giám sát vận hành & toàn vẹn dữ liệu.
--
--  A. error_events: nhật ký lỗi client + server (mất mạng, lỗi truy vấn Supabase, lỗi upload, lỗi render…).
--     Chỉ server (service role) ghi; chỉ quản trị viên đọc. Tự xoá sau 90 ngày (purge_error_events).
--  B. health_ping(): kiểm tra kết nối DB cho /api/health (không lộ dữ liệu).
--  C. Toàn vẹn dữ liệu:
--     - Index cho MỌI cột khoá ngoại (1 cột) trong schema public → ON DELETE CASCADE / SET NULL không quét toàn bảng.
--     - notifications.ref_id (tham chiếu đa hình, không thể đặt FK) → trigger xoá thông báo khi bản gốc bị xoá
--       (thông báo chung, bài tập, khoảnh khắc, đơn xin nghỉ, học phí, lịch học thử…).
--     - integrity_report(): đếm bản ghi mồ côi / bất thường (cả file Storage không còn bản ghi gốc).
--     - storage_orphans(): danh sách file Storage mồ côi để quản trị viên dọn (xoá qua Storage API).
--
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- A. Nhật ký lỗi
-- -----------------------------------------------------------------------------
create table if not exists public.error_events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  source       text not null,
  level        text not null default 'error',
  category     text not null default 'unknown',
  area         text,
  message      text not null,
  stack        text,
  digest       text,
  path         text,
  fingerprint  text not null,
  user_id      uuid references public.profiles (id) on delete set null,
  user_role    text,
  user_agent   text,
  release      text,
  context      jsonb not null default '{}'::jsonb,
  constraint error_events_source_valid check (source in ('client', 'server', 'edge')),
  constraint error_events_level_valid check (level in ('error', 'warning', 'fatal')),
  constraint error_events_category_valid check (category in ('network', 'supabase', 'upload', 'auth', 'render', 'chunk', 'unknown')),
  constraint error_events_message_len check (length(message) <= 1000),
  constraint error_events_stack_len check (stack is null or length(stack) <= 8000),
  constraint error_events_context_object check (jsonb_typeof(context) = 'object')
);
comment on table public.error_events is 'Nhật ký lỗi ứng dụng (client + server). Ghi bằng service role; quản trị viên đọc. Giữ 90 ngày.';
create index if not exists error_events_created_idx on public.error_events (created_at desc);
create index if not exists error_events_fingerprint_idx on public.error_events (fingerprint, created_at desc);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;
grant select on public.error_events to authenticated;
drop policy if exists "admin_select_error_events" on public.error_events;
create policy "admin_select_error_events" on public.error_events
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.purge_error_events(p_keep_days integer default 90)
returns integer
language sql security definer set search_path = ''
as $$
  with d as (
    delete from public.error_events where created_at < now() - make_interval(days => greatest(p_keep_days, 7)) returning 1
  )
  select count(*)::int from d;
$$;

-- -----------------------------------------------------------------------------
-- B. Health check
-- -----------------------------------------------------------------------------
create or replace function public.health_ping()
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  -- Đọc 1 bảng thật (không chỉ select 1) để chắc PostgREST + Postgres + quyền đều hoạt động
  select coalesce((select now() from public.classes limit 1), now());
$$;

-- -----------------------------------------------------------------------------
-- C1. Index cho mọi cột khoá ngoại 1 cột chưa có index đứng đầu
-- -----------------------------------------------------------------------------
do $$
declare
  fk record;
  idx_name text;
begin
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, c.conrelid as relid, c.conkey[1] as attnum
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
    where c.contype = 'f' and n.nspname = 'public' and cardinality(c.conkey) = 1
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    idx_name := left(replace(fk.tbl::text, 'public.', '') || '_' || fk.col || '_fk_idx', 63);
    execute format('create index if not exists %I on %s (%I)', idx_name, fk.tbl, fk.col);
    raise notice 'Tạo index % cho khoá ngoại %.%', idx_name, fk.tbl, fk.col;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- C2. Xoá thông báo trỏ tới bản ghi đã bị xoá (ref_id không có FK vì trỏ nhiều bảng)
-- -----------------------------------------------------------------------------
create or replace function public.notifications_cleanup_ref()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications where ref_id = old.id;
  return old;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['announcements', 'homework_assignments', 'homework_submissions', 'moments', 'moment_comments', 'leave_requests', 'fees', 'trial_classes', 'campus_transfer_requests']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists notifications_cleanup_ref on public.%I', t);
    execute format('create trigger notifications_cleanup_ref after delete on public.%I for each row execute function public.notifications_cleanup_ref()', t);
  end loop;
end $$;

-- Bản ghi gốc của thông báo còn tồn tại không (chỉ kiểm tra bảng đã có — migration chưa chạy thì bỏ qua)
create or replace function public.notification_ref_exists(p_ref uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  t text;
  v_hit boolean;
begin
  foreach t in array array['announcements', 'homework_assignments', 'homework_submissions', 'moments', 'moment_comments', 'leave_requests', 'fees', 'trial_classes', 'campus_transfer_requests']
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

-- Dọn thông báo mồ côi đã có từ trước
delete from public.notifications n where n.ref_id is not null and not public.notification_ref_exists(n.ref_id);

-- -----------------------------------------------------------------------------
-- C3. File Storage mồ côi: thư mục đầu = id bản ghi gốc
--     student-activities / daily-media / homework: {student_id}/… · moments: {moment_id}/… · chat: {conversation_id}/…
-- -----------------------------------------------------------------------------
create or replace function public.storage_orphans(p_limit integer default 1000)
returns table (bucket_id text, name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() and (select auth.role()) <> 'service_role' then
    raise exception 'Chỉ quản trị viên' using errcode = '42501';
  end if;
  return query execute format(
    $q$
    select o.bucket_id::text, o.name, o.created_at
    from storage.objects o
    where (o.bucket_id in ('student-activities', 'daily-media', 'homework')
           and not exists (select 1 from public.students s where s.id = public.safe_uuid((storage.foldername(o.name))[1])))
      %s %s
    order by o.created_at
    limit %s
    $q$,
    case when to_regclass('public.moments') is not null then
      $c$ or (o.bucket_id = 'moments' and not exists (select 1 from public.moments m where m.id = public.safe_uuid((storage.foldername(o.name))[1]))) $c$
    else '' end,
    case when to_regclass('public.chat_conversations') is not null then
      $c$ or (o.bucket_id = 'chat' and not exists (select 1 from public.chat_conversations c where c.id = public.safe_uuid((storage.foldername(o.name))[1]))) $c$
    else '' end,
    greatest(least(p_limit, 5000), 1)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- C4. Báo cáo toàn vẹn dữ liệu (quản trị viên xem ở /admin/system)
-- -----------------------------------------------------------------------------
create or replace function public.integrity_report()
returns table (check_key text, severity text, label text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() and (select auth.role()) <> 'service_role' then
    raise exception 'Chỉ quản trị viên' using errcode = '42501';
  end if;

  return query select 'fk_without_index', 'warning', 'Cột khoá ngoại chưa có index (xoá / cập nhật chậm)',
    (select count(*) from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
     where c.contype = 'f' and n.nspname = 'public' and cardinality(c.conkey) = 1
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]));

  return query select 'students_without_parent', 'info', 'Học sinh chưa gắn tài khoản phụ huynh',
    (select count(*) from public.students where parent_id is null);

  return query select 'parents_without_students', 'info', 'Tài khoản phụ huynh chưa có học sinh',
    (select count(*) from public.profiles p where p.role = 'parent' and not exists (select 1 from public.students s where s.parent_id = p.id));

  return query select 'profiles_without_auth', 'critical', 'Hồ sơ không còn tài khoản đăng nhập',
    (select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id));

  return query select 'teachers_without_class', 'info', 'Giáo viên chưa được phân công lớp',
    (select count(*) from public.profiles p where p.role = 'teacher' and not exists (select 1 from public.teacher_assignments a where a.teacher_id = p.id));

  return query select 'fees_overpaid', 'critical', 'Khoản học phí ghi nhận đã đóng lớn hơn số phải đóng',
    (select count(*) from public.fees where paid_amount > amount);

  return query select 'notifications_orphan_ref', 'warning', 'Thông báo trỏ tới bản ghi đã bị xoá',
    (select count(*) from public.notifications n where n.ref_id is not null and not public.notification_ref_exists(n.ref_id));

  return query select 'storage_orphans', 'warning', 'File ảnh / video không còn bản ghi gốc (chiếm dung lượng)',
    (select count(*) from public.storage_orphans(5000));

  if to_regclass('public.teaching_sessions') is not null then
    return query execute $q$ select 'sessions_left_open'::text, 'warning'::text, 'Ca dạy chưa kết thúc từ ngày trước'::text,
      (select count(*) from public.teaching_sessions where status = 'in_progress' and date < (now() at time zone 'Asia/Ho_Chi_Minh')::date) $q$;
  end if;

  return query select 'error_events_24h', 'info', 'Lỗi ứng dụng ghi nhận trong 24 giờ',
    (select count(*) from public.error_events where created_at > now() - interval '24 hours');
end;
$$;

-- Quyền gọi hàm
revoke execute on function public.purge_error_events(integer) from public, anon, authenticated;
revoke execute on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated;
revoke execute on function public.notifications_cleanup_ref() from public, anon, authenticated;
revoke execute on function public.notification_ref_exists(uuid) from public, anon, authenticated;
revoke execute on function public.storage_orphans(integer) from public, anon;
grant execute on function public.storage_orphans(integer) to authenticated;
revoke execute on function public.integrity_report() from public, anon;
grant execute on function public.integrity_report() to authenticated;

commit;
