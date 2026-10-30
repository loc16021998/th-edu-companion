-- =============================================================================
-- KIỂM TRA CÁCH LY DỮ LIỆU (RLS) — chỉ ĐỌC, không sửa dữ liệu.
-- Dán TOÀN BỘ file vào Supabase Dashboard → SQL Editor → Run.
--
-- Đóng vai lần lượt tối đa 30 phụ huynh + 30 giáo viên thật (role authenticated, đúng như app gọi),
-- đếm số dòng họ ĐỌC ĐƯỢC nhưng KHÔNG thuộc phạm vi của họ:
--   - Phụ huynh: dữ liệu học sinh không phải con mình, thông báo / phản hồi / chat của người khác,
--     hồ sơ phụ huynh khác, nhật ký, giao dịch ngân hàng, khoảnh khắc lớp khác…
--   - Giáo viên: học sinh / điểm danh / sổ liên lạc / học phí ngoài lớp được phân công.
-- Kết quả: bảng cuối cùng. Mọi dòng "leaks" phải = 0 (cột result = PASS).
-- =============================================================================
create temp table if not exists rls_test_results (
  actor_role text, actor_id uuid, table_name text, leaks bigint, result text
);
truncate rls_test_results;

do $$
declare
  p           record;
  v_children  uuid[];
  v_classes   text[];
  v_allowed   uuid[];
  v_count     bigint;
  v_rows      jsonb := '[]'::jsonb;
  chk         record;
begin
  -- -------------------------------------------------------------- PHỤ HUYNH
  for p in select distinct s.parent_id as uid from public.students s where s.parent_id is not null limit 30 loop
    select coalesce(array_agg(s.id), '{}'), coalesce(array_agg(s.campus::text || ':' || s.class_name), '{}')
      into v_children, v_classes
      from public.students s where s.parent_id = p.uid;

    perform set_config('request.jwt.claims', json_build_object('sub', p.uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p.uid::text, true);
    execute 'set local role authenticated';

    for chk in
      select * from (values
        ('students',             'select count(*) from public.students where not (id = any ($1))'),
        ('attendance',           'select count(*) from public.attendance where not (student_id = any ($1))'),
        ('daily_reports',        'select count(*) from public.daily_reports where not (student_id = any ($1))'),
        ('fees',                 'select count(*) from public.fees where not (student_id = any ($1))'),
        ('monthly_summaries',    'select count(*) from public.monthly_summaries where not (student_id = any ($1))'),
        ('homework_submissions', 'select count(*) from public.homework_submissions where not (student_id = any ($1))'),
        ('leave_requests',       'select count(*) from public.leave_requests where not (student_id = any ($1))'),
        ('feedback',             'select count(*) from public.feedback where parent_id <> $2'),
        ('notifications',        'select count(*) from public.notifications where recipient_id <> $2'),
        ('chat_conversations',   'select count(*) from public.chat_conversations where parent_id <> $2'),
        ('profiles',             'select count(*) from public.profiles where role = ''parent'' and id <> $2'),
        ('moments',              'select count(*) from public.moments where not (campus::text || '':'' || class_name = any ($3))'),
        ('fee_payments',         'select count(*) from public.fee_payments fp where not exists (select 1 from public.fees f where f.id = fp.fee_id and f.student_id = any ($1))'),
        ('teacher_attendance',   'select count(*) from public.teacher_attendance'),
        ('bank_transactions',    'select count(*) from public.bank_transactions'),
        ('audit_logs',           'select count(*) from public.audit_logs'),
        ('rate_limits',          'select count(*) from public.rate_limits'),
        ('push_subscriptions',   'select count(*) from public.push_subscriptions where user_id <> $2')
      ) as v(tbl, q)
    loop
      if to_regclass('public.' || chk.tbl) is null then continue; end if;
      begin
        execute chk.q into v_count using v_children, p.uid, v_classes;
      exception when insufficient_privilege then
        v_count := 0;   -- không có quyền đọc bảng = an toàn
      end;
      v_rows := v_rows || jsonb_build_object('role', 'parent', 'id', p.uid, 'tbl', chk.tbl, 'n', v_count);
    end loop;

    execute 'reset role';
  end loop;

  -- -------------------------------------------------------------- GIÁO VIÊN
  for p in select distinct ta.teacher_id as uid from public.teacher_assignments ta limit 30 loop
    select coalesce(array_agg(s.id), '{}') into v_allowed
      from public.students s
      where exists (
        select 1 from public.teacher_assignments ta
        where ta.teacher_id = p.uid and ta.campus = s.campus and (ta.class_name is null or ta.class_name = s.class_name)
      );

    perform set_config('request.jwt.claims', json_build_object('sub', p.uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p.uid::text, true);
    execute 'set local role authenticated';

    for chk in
      select * from (values
        ('students',             'select count(*) from public.students where not (id = any ($1))'),
        ('attendance',           'select count(*) from public.attendance where not (student_id = any ($1))'),
        ('daily_reports',        'select count(*) from public.daily_reports where not (student_id = any ($1))'),
        ('fees',                 'select count(*) from public.fees where not (student_id = any ($1))'),
        ('homework_submissions', 'select count(*) from public.homework_submissions where not (student_id = any ($1))'),
        ('leave_requests',       'select count(*) from public.leave_requests where not (student_id = any ($1))'),
        ('notifications',        'select count(*) from public.notifications where recipient_id <> $2'),
        ('audit_logs',           'select count(*) from public.audit_logs'),
        ('bank_transactions',    'select count(*) from public.bank_transactions')
      ) as v(tbl, q)
    loop
      if to_regclass('public.' || chk.tbl) is null then continue; end if;
      begin
        execute chk.q into v_count using v_allowed, p.uid;
      exception when insufficient_privilege then
        v_count := 0;
      end;
      v_rows := v_rows || jsonb_build_object('role', 'teacher', 'id', p.uid, 'tbl', chk.tbl, 'n', v_count);
    end loop;

    execute 'reset role';
  end loop;

  insert into rls_test_results
  select r ->> 'role', (r ->> 'id')::uuid, r ->> 'tbl', (r ->> 'n')::bigint,
         case when (r ->> 'n')::bigint = 0 then 'PASS' else 'LEAK' end
  from jsonb_array_elements(v_rows) r;
end $$;

-- Tổng hợp: mỗi bảng × vai trò. Mọi dòng phải là PASS.
select actor_role, table_name,
       count(*)                      as accounts_tested,
       sum(leaks)                    as total_leaks,
       case when sum(leaks) = 0 then 'PASS' else 'LEAK' end as result
from rls_test_results
group by actor_role, table_name
order by (sum(leaks) = 0), actor_role, table_name;
