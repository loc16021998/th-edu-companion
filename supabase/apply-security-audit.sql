-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Bảo mật nâng cao & Nhật ký hoạt động. Chạy SAU các file apply-*.sql trước đó (apply-moments.sql). Chạy lại vẫn an toàn.
-- =============================================================================
-- Bảo mật nâng cao & Nhật ký hoạt động (Security & Audit)
--
--  A. Củng cố RLS / quyền:
--     - anon (chưa đăng nhập) KHÔNG có quyền gì trên bảng / sequence / hàm của schema public — kể cả bảng tạo sau này.
--     - Mọi bảng public bắt buộc bật RLS (bảng nào quên → bật, không policy = không ai đọc được).
--     - Hàm: thu hồi EXECUTE mặc định của PUBLIC/anon; chỉ cấp cho authenticated các hàm không phải nội bộ.
--     - students: chỉ quản trị viên được đổi phụ huynh / cơ sở / lớp của học sinh (chặn gắn bé sang tài khoản khác).
--     - profiles: chỉ quản trị viên được đổi SĐT (SĐT dùng để liên kết phụ huynh ↔ học sinh).
--  B. audit_logs: tự ghi mọi thao tác TẠO / SỬA / XOÁ dữ liệu nhạy cảm của giáo viên, quản trị viên và hệ thống
--     (điểm danh, học phí, sổ liên lạc, học sinh, phân công…). Chỉ quản trị viên xem; không ai sửa / xoá được.
--  C. rate_limits: bộ đếm chống spam / dò mật khẩu dùng chung giữa các instance (chỉ service_role gọi).
--  D. security_audit_report(): quản trị viên tự kiểm tra cấu hình bảo mật ngay trong app.
--
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- =============================================================================
-- A. CỦNG CỐ QUYỀN
-- =============================================================================

-- A.1 anon: không có quyền trên dữ liệu nghiệp vụ (đăng nhập đi qua Supabase Auth, không đọc bảng)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- A.2 Bảng nào trong public chưa bật RLS → bật (không policy = từ chối tất cả với authenticated)
do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', t.tbl);
    raise notice 'Đã bật RLS cho bảng %', t.tbl;
  end loop;
end $$;

-- A.3 students: chỉ admin được đổi phụ huynh / cơ sở / lớp (policy cho giáo viên sửa HS trong phạm vi
--     không đủ: giáo viên có thể đổi parent_id → lộ dữ liệu bé cho tài khoản khác).
create or replace function public.protect_student_structural_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (new.parent_id  is distinct from old.parent_id
       or new.campus     is distinct from old.campus
       or new.class_name is distinct from old.class_name
       or new.id         is distinct from old.id) then
    raise exception 'Chỉ quản trị viên được đổi phụ huynh, cơ sở hoặc lớp của học sinh'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists students_protect_structural_columns on public.students;
create trigger students_protect_structural_columns
  before update on public.students
  for each row execute function public.protect_student_structural_columns();

-- A.4 profiles: thêm SĐT vào nhóm cột chỉ admin được đổi
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.is_admin()
     and (new.role   is distinct from old.role
       or new.campus is distinct from old.campus
       or new.phone  is distinct from old.phone
       or new.id     is distinct from old.id) then
    raise exception 'Không có quyền thay đổi vai trò / cơ sở / số điện thoại'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- B. NHẬT KÝ HOẠT ĐỘNG (audit_logs)
-- =============================================================================
create table if not exists public.audit_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid,                 -- auth.uid() người thao tác; NULL = hệ thống (webhook ngân hàng, cron, SQL)
  actor_name      text,                 -- tên lúc thao tác (giữ lại kể cả khi tài khoản bị xoá)
  actor_role      text not null,        -- admin | teacher | system
  action          text not null,        -- CREATE | UPDATE | DELETE
  table_name      text not null,
  record_id       text,
  student_id      uuid,                 -- học sinh liên quan (lọc nhanh khi có tranh chấp)
  changed_fields  text[],
  old_data        jsonb,                -- UPDATE: chỉ các cột thay đổi; DELETE: toàn bộ bản ghi
  new_data        jsonb,                -- UPDATE: chỉ các cột thay đổi; CREATE: toàn bộ bản ghi
  created_at      timestamptz not null default now(),
  constraint audit_logs_action_check check (action in ('CREATE', 'UPDATE', 'DELETE')),
  constraint audit_logs_role_check check (actor_role in ('admin', 'teacher', 'system'))
);
comment on table public.audit_logs is
  'Nhật ký thay đổi dữ liệu nhạy cảm (ghi tự động bằng trigger audit_row_change). Chỉ thêm, không sửa/xoá.';

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_table_idx   on public.audit_logs (table_name, created_at desc);
create index if not exists audit_logs_user_idx    on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_student_idx on public.audit_logs (student_id, created_at desc) where student_id is not null;
create index if not exists audit_logs_record_idx  on public.audit_logs (record_id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- Chỉ thêm: không ai (kể cả service_role) sửa nhật ký; xoá chỉ khi chủ động bật cờ dọn dữ liệu cũ
--   begin; set local app.allow_audit_purge = 'on'; delete from public.audit_logs where created_at < now() - interval '2 years'; commit;
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_audit_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Nhật ký hoạt động không được sửa hoặc xoá' using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- Trigger chung. Tham số (TG_ARGV): các cột bỏ qua khi so sánh / không lưu (vd. ảnh base64, payload thô).
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_role     text;
  v_name     text;
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_ignore   text[] := array['updated_at', 'created_at'] || coalesce(tg_argv::text[], '{}');
  v_row      jsonb;
  v_student  uuid;
  k          text;
begin
  if v_uid is null then
    v_role := 'system';
  else
    select p.role::text, p.full_name into v_role, v_name from public.profiles p where p.id = v_uid;
    -- Chỉ ghi thao tác của giáo viên / quản trị viên (phụ huynh không sửa được dữ liệu nhạy cảm — RLS chặn)
    if v_role is null or v_role not in ('admin', 'teacher') then
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new); end if;
  foreach k in array v_ignore loop
    v_old := v_old - k;
    v_new := v_new - k;
  end loop;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key);
    -- upsert ghi lại giá trị y hệt (vd. lưu lại điểm danh cả lớp) → không phải thay đổi, bỏ qua
    if v_changed is null then
      return null;
    end if;
    select jsonb_object_agg(key, value) into v_old from jsonb_each(v_old) where key = any (v_changed);
    select jsonb_object_agg(key, value) into v_new from jsonb_each(v_new) where key = any (v_changed);
  end if;

  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  v_student := case
    when tg_table_name = 'students' then public.safe_uuid(v_row ->> 'id')
    else public.safe_uuid(v_row ->> 'student_id')
  end;

  insert into public.audit_logs (user_id, actor_name, actor_role, action, table_name, record_id, student_id, changed_fields, old_data, new_data)
  values (
    v_uid,
    coalesce(nullif(v_name, ''), case when v_uid is null then 'Hệ thống' else null end),
    v_role,
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    v_student,
    v_changed,
    v_old,
    v_new
  );
  return null;
end;
$$;

-- Gắn trigger vào các bảng nhạy cảm (bảng nào chưa có — chưa chạy migration tương ứng — thì bỏ qua)
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('attendance',           null),
      ('daily_reports',        null),
      ('fees',                 null),
      ('fee_payments',         null),
      ('students',             null),
      ('profiles',             null),
      ('teacher_assignments',  null),
      ('classes',              null),
      ('teacher_attendance',   null),
      ('homework_submissions', null),
      ('leave_requests',       null),
      ('monthly_summaries',    null),
      ('payment_config',       null),
      ('bank_transactions',    'raw')
    ) as v(tbl, ignore_cols)
  loop
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'Bỏ qua nhật ký cho bảng % (chưa tồn tại)', spec.tbl;
      continue;
    end if;
    execute format('drop trigger if exists audit_row_change on public.%I', spec.tbl);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change(%s)',
      spec.tbl,
      coalesce(quote_literal(spec.ignore_cols), '')
    );
  end loop;
end $$;

-- =============================================================================
-- C. RATE LIMIT (bộ đếm cửa sổ cố định — chỉ server gọi bằng service_role)
-- =============================================================================
create table if not exists public.rate_limits (
  key             text primary key,
  window_start    timestamptz not null default now(),
  window_seconds  integer not null,
  hit_count       integer not null default 0
);
alter table public.rate_limits enable row level security;   -- không policy: chỉ service_role
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_increment boolean default true)
returns table (hit_count integer, ttl_seconds integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.rate_limits;
begin
  if p_key is null or length(p_key) > 200 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Tham số rate limit không hợp lệ' using errcode = '22023';
  end if;

  if not p_increment then
    select * into r from public.rate_limits rl where rl.key = p_key;
    if not found or r.window_start + make_interval(secs => r.window_seconds) <= now() then
      return query select 0, 0;
    else
      return query select r.hit_count, greatest(1, ceil(extract(epoch from r.window_start + make_interval(secs => r.window_seconds) - now()))::integer);
    end if;
    return;
  end if;

  insert into public.rate_limits as rl (key, window_start, window_seconds, hit_count)
  values (p_key, now(), p_window_seconds, 1)
  on conflict (key) do update set
    hit_count      = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then 1 else rl.hit_count + 1 end,
    window_start   = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then now() else rl.window_start end,
    window_seconds = case when rl.window_start + make_interval(secs => rl.window_seconds) <= now() then excluded.window_seconds else rl.window_seconds end
  returning * into r;

  -- Dọn bộ đếm đã hết hạn (thỉnh thoảng, không cần cron)
  if random() < 0.02 then
    delete from public.rate_limits rl where rl.window_start + make_interval(secs => rl.window_seconds) < now() - interval '1 hour';
  end if;

  return query select r.hit_count, greatest(1, ceil(extract(epoch from r.window_start + make_interval(secs => r.window_seconds) - now()))::integer);
end;
$$;

create or replace function public.rate_limit_reset(p_key text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.rate_limits where key = p_key;
$$;

-- =============================================================================
-- D. TỰ KIỂM TRA BẢO MẬT (quản trị viên gọi trong app)
-- =============================================================================
create or replace function public.security_audit_report()
returns table (severity text, category text, object_name text, detail text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được xem báo cáo bảo mật' using errcode = '42501';
  end if;

  -- Bảng chưa bật RLS
  return query
  select 'critical', 'rls', c.relname::text, 'Bảng chưa bật Row Level Security'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  -- Bảng bật RLS nhưng chưa có policy (không ai ngoài service_role đọc được — có thể là cố ý)
  return query
  select 'info', 'rls', c.relname::text, 'Đã bật RLS, chưa có policy (chỉ server/service_role truy cập)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  -- anon còn quyền trên bảng
  return query
  select 'critical', 'grant', g.table_name::text, 'anon còn quyền ' || string_agg(g.privilege_type, ', ' order by g.privilege_type)
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'anon'
  group by g.table_name;

  -- Hàm SECURITY DEFINER anon gọi được
  return query
  select 'high', 'function', p.oid::regprocedure::text, 'Hàm SECURITY DEFINER mà anon (chưa đăng nhập) gọi được'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute');

  -- Hàm SECURITY DEFINER không cố định search_path (có thể bị chiếm quyền qua schema giả)
  return query
  select 'high', 'function', p.oid::regprocedure::text, 'Hàm SECURITY DEFINER chưa đặt search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');

  -- Policy cho phép mọi người dùng đã đăng nhập (using true) — xem lại có cố ý không
  return query
  select 'info', 'policy', (c.relname || ' · ' || pol.polname)::text, 'Policy USING (true): mọi tài khoản đã đăng nhập đều đọc được'
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and pg_get_expr(pol.polqual, pol.polrelid) = 'true';

  -- Policy áp cho anon / public
  return query
  select 'high', 'policy', (c.relname || ' · ' || pol.polname)::text, 'Policy áp dụng cho anon / PUBLIC'
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and (0 = any (pol.polroles) or 'anon'::regrole = any (pol.polroles));

  -- Kho lưu trữ công khai
  return query
  select 'high', 'storage', b.id::text, 'Bucket đang để công khai (ai có link cũng xem được)'
  from storage.buckets b where b.public;
end;
$$;

-- =============================================================================
-- A.5 EXECUTE trên hàm: PUBLIC/anon → không; authenticated → mọi hàm trừ hàm nội bộ; service_role → tất cả
-- =============================================================================
do $$
declare
  f record;
  internal text[] := array[
    'notify_parent', 'notify_parent_ref', 'announcement_recipients', 'admin_feed_push', 'admin_feed_student_label',
    'rate_limit_hit', 'rate_limit_reset', 'audit_row_change', 'audit_logs_immutable'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- bỏ qua hàm của extension
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.is_trigger or f.proname = any (internal) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

commit;
