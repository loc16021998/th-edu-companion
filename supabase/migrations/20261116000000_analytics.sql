-- =============================================================================
-- Trung tâm phân tích (Admin → Phân tích vận hành).
--
--  - analytics_report(p_months, p_weeks): MỌI phép đếm / cộng chạy trong Postgres (GROUP BY, FILTER, date_trunc) và
--    trả về 1 gói JSON nhỏ (vài trăm con số) — không kéo hàng nghìn dòng điểm danh / học phí về máy chủ ứng dụng.
--    Chỉ quản trị viên (hoặc service role cho báo cáo tự động).
--  - classes.capacity: sĩ số tối đa của lớp → tỷ lệ lấp đầy theo môn.
--  - Index phục vụ các truy vấn gom nhóm theo thời gian.
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

alter table public.classes add column if not exists capacity smallint;
alter table public.classes drop constraint if exists classes_capacity_range;
alter table public.classes add constraint classes_capacity_range check (capacity is null or capacity between 1 and 200);
-- Môn dạy chính của lớp (có sẵn nếu đã chạy apply-teaching-payroll.sql)
alter table public.classes add column if not exists subject text;
comment on column public.classes.capacity is 'Sĩ số tối đa của lớp — tính tỷ lệ lấp đầy (Phân tích vận hành).';

create index if not exists students_created_idx on public.students (created_at);
create index if not exists fees_due_date_idx on public.fees (due_date);
do $$
begin
  if to_regclass('public.leads') is not null then
    create index if not exists leads_created_idx on public.leads (created_at);
  end if;
end $$;

create or replace function public.analytics_report(p_months integer default 12, p_weeks integer default 12)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today       date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month       date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date;
  v_months      integer := greatest(3, least(coalesce(p_months, 12), 24));
  v_weeks       integer := greatest(4, least(coalesce(p_weeks, 12), 26));
  v_from_month  date;
  v_from_week   date;
  v_result      jsonb := '{}'::jsonb;
  v_part        jsonb;
begin
  if not public.is_admin() and (select auth.role()) <> 'service_role' then
    raise exception 'Chỉ quản trị viên xem được báo cáo' using errcode = '42501';
  end if;
  v_from_month := (v_month - make_interval(months => v_months - 1))::date;
  v_from_week := (date_trunc('week', v_today::timestamp) - make_interval(weeks => v_weeks - 1))::date;

  -- 1. Sĩ số hiện tại theo cơ sở + đăng ký theo môn (mảng students.subjects)
  select jsonb_build_object(
    'students_by_campus', coalesce((select jsonb_object_agg(campus, n) from (select campus, count(*) n from public.students group by campus) x), '{}'::jsonb),
    'subjects_by_campus', coalesce((
      select jsonb_object_agg(subject, by_campus) from (
        select subject, jsonb_object_agg(campus, n) by_campus
        from (select unnest(s.subjects) subject, s.campus, count(*) n from public.students s group by 1, 2) y
        group by subject
      ) z), '{}'::jsonb)
  ) into v_part;
  v_result := v_result || v_part;

  -- 2. Tỷ lệ lấp đầy: học sinh đang xếp lớp / sĩ số tối đa, gom theo môn chính của lớp
  select jsonb_build_object('fill', coalesce(jsonb_agg(f order by f->>'subject'), '[]'::jsonb)) into v_part
  from (
    select jsonb_build_object(
      'subject', coalesce(c.subject, 'tong_hop'),
      'classes', count(*),
      'classes_with_capacity', count(*) filter (where c.capacity is not null),
      'capacity', coalesce(sum(c.capacity), 0),
      'students', coalesce(sum(sc.n), 0),
      'students_in_capped', coalesce(sum(sc.n) filter (where c.capacity is not null), 0)
    ) f
    from public.classes c
    left join (select campus, class_name, count(*) n from public.students group by 1, 2) sc on sc.campus = c.campus and sc.class_name = c.name
    group by coalesce(c.subject, 'tong_hop')
  ) t;
  v_result := v_result || v_part;

  -- 3. Theo tháng: học sinh mới (theo ngày nhập), học sinh có đi học (≥ 1 buổi có mặt / muộn), giữ chân, doanh thu
  with months as (
    select generate_series(v_from_month, v_month, interval '1 month')::date m
  ),
  active as (
    select date_trunc('month', a.date)::date m, a.student_id
    from public.attendance a
    where a.date >= (v_from_month - interval '1 month') and a.status in ('present', 'late')
    group by 1, 2
  ),
  retention as (
    select cur.m, count(*) filter (where prev.student_id is not null) kept, (select count(*) from active p where p.m = (cur.m - interval '1 month')::date) base
    from (select distinct m from active) cur_m
    join active cur on cur.m = cur_m.m
    left join active prev on prev.student_id = cur.student_id and prev.m = (cur.m - interval '1 month')::date
    group by cur.m
  ),
  paid as (
    select date_trunc('month', p.paid_at at time zone 'Asia/Ho_Chi_Minh')::date m, sum(p.amount) collected
    from public.fee_payments p
    where p.paid_at >= (v_from_month::timestamp at time zone 'Asia/Ho_Chi_Minh')
    group by 1
  ),
  issued as (
    select coalesce(f.period, date_trunc('month', coalesce(f.due_date, (f.created_at at time zone 'Asia/Ho_Chi_Minh')::date))::date) m,
           sum(f.amount) issued, sum(f.amount - f.paid_amount) outstanding
    from public.fees f
    where coalesce(f.period, f.due_date, (f.created_at at time zone 'Asia/Ho_Chi_Minh')::date) >= v_from_month
    group by 1
  )
  select jsonb_build_object('monthly', jsonb_agg(jsonb_build_object(
    'month', to_char(ms.m, 'YYYY-MM'),
    'new_students', (select count(*) from public.students s where s.created_at >= (ms.m::timestamp at time zone 'Asia/Ho_Chi_Minh')
                       and s.created_at < ((ms.m + interval '1 month')::timestamp at time zone 'Asia/Ho_Chi_Minh')),
    'active_students', (select count(*) from active ac where ac.m = ms.m),
    'retained', r.kept,
    'retention_base', r.base,
    'collected', coalesce(pd.collected, 0),
    'issued', coalesce(i.issued, 0),
    'outstanding', coalesce(i.outstanding, 0)
  ) order by ms.m)) into v_part
  from months ms
  left join retention r on r.m = ms.m
  left join paid pd on pd.m = ms.m
  left join issued i on i.m = ms.m;
  v_result := v_result || v_part;

  -- 4. Chuyên cần theo tuần (Thứ 2 đầu tuần), theo cơ sở
  select jsonb_build_object('weekly', coalesce(jsonb_agg(w order by w->>'week'), '[]'::jsonb)) into v_part
  from (
    select jsonb_build_object(
      'week', to_char(date_trunc('week', a.date::timestamp), 'YYYY-MM-DD'),
      'campus', s.campus,
      'present', count(*) filter (where a.status = 'present'),
      'late', count(*) filter (where a.status = 'late'),
      'absent', count(*) filter (where a.status = 'absent'),
      'excused', count(*) filter (where a.status::text = 'absent_with_permission')
    ) w
    from public.attendance a
    join public.students s on s.id = a.student_id
    where a.date >= v_from_week and a.date <= v_today
    group by date_trunc('week', a.date::timestamp), s.campus
  ) t;
  v_result := v_result || v_part;

  -- 5. Lớp cần chú ý: tỷ lệ nghỉ không phép 4 tuần gần nhất so với 4 tuần trước đó
  select jsonb_build_object('classes', coalesce(jsonb_agg(c order by (c->>'absent_rate')::numeric desc nulls last), '[]'::jsonb)) into v_part
  from (
    select jsonb_build_object(
      'campus', s.campus,
      'class_name', s.class_name,
      'students', count(distinct s.id),
      'records', count(*) filter (where a.date > v_today - 28),
      'absent_rate', round(100.0 * count(*) filter (where a.date > v_today - 28 and a.status = 'absent')
                     / nullif(count(*) filter (where a.date > v_today - 28 and a.status::text <> 'absent_with_permission'), 0), 1),
      'late_rate', round(100.0 * count(*) filter (where a.date > v_today - 28 and a.status = 'late')
                   / nullif(count(*) filter (where a.date > v_today - 28 and a.status::text <> 'absent_with_permission'), 0), 1),
      'prev_absent_rate', round(100.0 * count(*) filter (where a.date <= v_today - 28 and a.status = 'absent')
                          / nullif(count(*) filter (where a.date <= v_today - 28 and a.status::text <> 'absent_with_permission'), 0), 1)
    ) c
    from public.attendance a
    join public.students s on s.id = a.student_id
    where a.date > v_today - 56 and a.date <= v_today
    group by s.campus, s.class_name
  ) t;
  v_result := v_result || v_part;

  -- 6. Theo cơ sở (30 ngày gần nhất / tháng này): chuyên cần, thực thu tháng, phát hành tháng, công nợ hiện tại
  select jsonb_build_object('campus', coalesce(jsonb_object_agg(x.campus, x.obj), '{}'::jsonb)) into v_part
  from (
    select c.campus, jsonb_build_object(
      'attendance_rate', (select round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*) filter (where a.status::text <> 'absent_with_permission'), 0), 1)
                          from public.attendance a join public.students s on s.id = a.student_id
                          where s.campus = c.campus and a.date > v_today - 30 and a.date <= v_today),
      'collected_month', (select coalesce(sum(p.amount), 0) from public.fee_payments p join public.fees f on f.id = p.fee_id join public.students s on s.id = f.student_id
                          where s.campus = c.campus and p.paid_at >= (v_month::timestamp at time zone 'Asia/Ho_Chi_Minh')),
      'issued_month', (select coalesce(sum(f.amount), 0) from public.fees f join public.students s on s.id = f.student_id
                       where s.campus = c.campus and coalesce(f.period, date_trunc('month', f.due_date)::date) = v_month),
      'outstanding', (select coalesce(sum(f.amount - f.paid_amount), 0) from public.fees f join public.students s on s.id = f.student_id
                      where s.campus = c.campus and f.status <> 'paid'),
      'classes', (select count(*) from public.classes cl where cl.campus = c.campus),
      'new_students_month', (select count(*) from public.students s where s.campus = c.campus and s.created_at >= (v_month::timestamp at time zone 'Asia/Ho_Chi_Minh'))
    ) obj
    from (select unnest(enum_range(null::public.campus)) campus) c
  ) x;
  v_result := v_result || v_part;

  -- 7. Tuyển sinh (bảng có sau apply-admissions.sql): quan tâm theo môn / tháng, chuyển đổi học thử → nhập học
  if to_regclass('public.leads') is not null and to_regclass('public.trial_classes') is not null then
    execute $q$
      select jsonb_build_object(
        'interest', coalesce((
          select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'subject', target_program, 'leads', n) order by m)
          from (select date_trunc('month', l.created_at at time zone 'Asia/Ho_Chi_Minh')::date m, l.target_program, count(*) n
                from public.leads l where l.created_at >= ($1::timestamp at time zone 'Asia/Ho_Chi_Minh') group by 1, 2) x), '[]'::jsonb),
        'funnel', (
          select jsonb_build_object(
            'leads', count(*),
            'trialed', count(*) filter (where exists (select 1 from public.trial_classes t where t.lead_id = l.id and t.status = 'completed')),
            'enrolled', count(*) filter (where l.status = 'enrolled'),
            'enrolled_after_trial', count(*) filter (where l.status = 'enrolled' and exists (select 1 from public.trial_classes t where t.lead_id = l.id and t.status = 'completed')),
            'lost', count(*) filter (where l.status = 'lost'),
            'open', count(*) filter (where l.status in ('new', 'contacted', 'trial_booked'))
          )
          from public.leads l where l.created_at >= ($1::timestamp at time zone 'Asia/Ho_Chi_Minh'))
      )
    $q$ into v_part using v_from_month;
    v_result := v_result || v_part;
  end if;

  -- 7b. Tuần hiện tại (Thứ 2 → hôm nay) — cho báo cáo tự động tối Chủ nhật
  select jsonb_build_object('this_week', jsonb_build_object(
    'from', to_char(date_trunc('week', v_today::timestamp), 'YYYY-MM-DD'),
    'collected', (select coalesce(sum(p.amount), 0) from public.fee_payments p
                  where p.paid_at >= (date_trunc('week', v_today::timestamp) at time zone 'Asia/Ho_Chi_Minh')),
    'new_students', (select count(*) from public.students s
                     where s.created_at >= (date_trunc('week', v_today::timestamp) at time zone 'Asia/Ho_Chi_Minh'))
  )) into v_part;
  v_result := v_result || v_part;
  if to_regclass('public.leads') is not null then
    execute $q$ select jsonb_build_object('leads_this_week', (select count(*) from public.leads l
      where l.created_at >= (date_trunc('week', $1::timestamp) at time zone 'Asia/Ho_Chi_Minh'))) $q$ into v_part using v_today;
    v_result := v_result || v_part;
  end if;

  -- 8. Đăng ký môn của học sinh MỚI theo tháng (xu hướng chọn môn khi nhập học)
  select jsonb_build_object('enroll_subjects', coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'subject', subject, 'students', n) order by m), '[]'::jsonb)) into v_part
  from (
    select date_trunc('month', s.created_at at time zone 'Asia/Ho_Chi_Minh')::date m, unnest(s.subjects) subject, count(*) n
    from public.students s
    where s.created_at >= (v_from_month::timestamp at time zone 'Asia/Ho_Chi_Minh')
    group by 1, 2
  ) t;
  v_result := v_result || v_part;

  return v_result || jsonb_build_object('generated_at', now(), 'today', v_today, 'from_month', to_char(v_from_month, 'YYYY-MM'), 'from_week', v_from_week);
end;
$$;

revoke execute on function public.analytics_report(integer, integer) from public, anon;
grant execute on function public.analytics_report(integer, integer) to authenticated;

commit;
