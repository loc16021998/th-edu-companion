-- =============================================================================
-- Thông báo cho QUẢN TRỊ VIÊN: mọi hoạt động của phụ huynh & giáo viên trong một bảng tin chung.
--   Phụ huynh: gửi phản hồi, gửi / huỷ đơn xin nghỉ, nộp bài tập, nhắn tin.
--   Giáo viên: điểm danh, viết sổ liên lạc, giao / chấm bài tập, xử lý đơn nghỉ, gửi tổng kết tháng, nhắn tin.
-- Hoạt động lặp lại được GỘP (cùng nhóm trong 30 phút → cập nhật 1 dòng, tăng bộ đếm) để không ngập thông báo.
-- Mỗi quản trị viên có mốc "đã xem" riêng (admin_notification_state). Realtime → chuông trên header cập nhật ngay.
-- Trigger chỉ GHI THÊM, lỗi (nếu có) không làm hỏng thao tác gốc. Chạy lại nhiều lần vẫn an toàn.
-- Cần đã chạy các migration tạo bảng nguồn (feedback, leave_requests, chat, homework, monthly_summaries).
-- =============================================================================

create table if not exists public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_role   text not null,
  actor_name   text not null default '',
  title        text not null,
  body         text not null default '',
  href         text not null default '/admin/dashboard',
  group_key    text,
  event_count  integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint admin_notifications_category_valid
    check (category in ('feedback', 'leave', 'chat', 'homework', 'daily_report', 'attendance', 'summary')),
  constraint admin_notifications_actor_role_valid check (actor_role in ('parent', 'teacher'))
);
create index if not exists admin_notifications_updated_idx on public.admin_notifications (updated_at desc);
create index if not exists admin_notifications_group_idx on public.admin_notifications (group_key, updated_at desc) where group_key is not null;

create table if not exists public.admin_notification_state (
  admin_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at  timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_state enable row level security;
revoke all on public.admin_notifications, public.admin_notification_state from anon;

drop policy if exists "admin_select_admin_notifications" on public.admin_notifications;
create policy "admin_select_admin_notifications" on public.admin_notifications
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin_delete_admin_notifications" on public.admin_notifications;
create policy "admin_delete_admin_notifications" on public.admin_notifications
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "admin_notification_state_own" on public.admin_notification_state;
create policy "admin_notification_state_own" on public.admin_notification_state
  for all to authenticated
  using (admin_id = (select auth.uid()) and (select public.is_admin()))
  with check (admin_id = (select auth.uid()) and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Ghi 1 hoạt động (bỏ qua nếu người làm là quản trị viên / không xác định). p_group: gộp trong 30 phút.
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_push(
  p_category text, p_actor uuid, p_group text, p_title text, p_body text, p_href text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_name text;
  v_id   uuid;
begin
  if p_actor is null then
    return;
  end if;
  select p.role::text, coalesce(p.full_name, '') into v_role, v_name from public.profiles p where p.id = p_actor;
  if v_role is null or v_role not in ('parent', 'teacher') then
    return;
  end if;

  if p_group is not null then
    select n.id into v_id
    from public.admin_notifications n
    where n.group_key = p_group and n.updated_at > now() - interval '30 minutes'
    order by n.updated_at desc
    limit 1;
    if v_id is not null then
      update public.admin_notifications
      set title = p_title, body = coalesce(p_body, ''), href = coalesce(p_href, href),
          event_count = event_count + 1, updated_at = now(), actor_id = p_actor, actor_name = v_name
      where id = v_id;
      return;
    end if;
  end if;

  insert into public.admin_notifications (category, actor_id, actor_role, actor_name, title, body, href, group_key)
  values (p_category, p_actor, v_role, v_name, p_title, coalesce(p_body, ''), coalesce(p_href, '/admin/dashboard'), p_group);
end;
$$;
revoke execute on function public.admin_feed_push(text, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_feed_student_label(p_student uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.full_name || ' (' || s.class_name || ')' from public.students s where s.id = p_student;
$$;
revoke execute on function public.admin_feed_student_label(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Phản hồi của phụ huynh
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_feedback()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.admin_feed_push(
      'feedback', new.parent_id, null,
      'Phản hồi mới từ phụ huynh',
      left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 160),
      '/admin/feedback'
    );
  exception when others then raise warning 'admin_feed_feedback: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_feedback on public.feedback;
create trigger admin_feed_feedback after insert on public.feedback
  for each row execute function public.admin_feed_feedback();

-- -----------------------------------------------------------------------------
-- 2. Đơn xin nghỉ: phụ huynh gửi / huỷ; giáo viên đồng ý / từ chối
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_leave()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_range text := case when new.start_date = new.end_date then to_char(new.start_date, 'DD/MM')
                       else to_char(new.start_date, 'DD/MM') || ' – ' || to_char(new.end_date, 'DD/MM') end;
  v_student text := public.admin_feed_student_label(new.student_id);
begin
  begin
    if tg_op = 'INSERT' then
      perform public.admin_feed_push('leave', new.parent_id, null,
        'Đơn xin nghỉ mới: bé ' || coalesce(v_student, ''),
        'Nghỉ ' || v_range || ' · ' || public.leave_reason_label(new.reason)
          || case when nullif(trim(new.note), '') is not null then ' · ' || left(trim(new.note), 100) else '' end,
        '/admin/leave-requests');
    elsif new.status is distinct from old.status then
      if new.status = 'cancelled' then
        perform public.admin_feed_push('leave', new.parent_id, null,
          'Phụ huynh huỷ đơn xin nghỉ: bé ' || coalesce(v_student, ''), 'Nghỉ ' || v_range, '/admin/leave-requests?view=done');
      elsif new.status in ('approved', 'rejected') then
        perform public.admin_feed_push('leave', (select auth.uid()), null,
          case when new.status = 'approved' then 'Đã đồng ý đơn xin nghỉ: bé ' else 'Từ chối đơn xin nghỉ: bé ' end || coalesce(v_student, ''),
          'Nghỉ ' || v_range || case when nullif(trim(new.decision_note), '') is not null then ' · “' || left(trim(new.decision_note), 100) || '”' else '' end,
          '/admin/leave-requests?view=done');
      end if;
    end if;
  exception when others then raise warning 'admin_feed_leave: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_leave on public.leave_requests;
create trigger admin_feed_leave after insert or update of status on public.leave_requests
  for each row execute function public.admin_feed_leave();

-- -----------------------------------------------------------------------------
-- 3. Tin nhắn phụ huynh ↔ giáo viên (gộp theo cuộc trò chuyện)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent  text;
  v_teacher text;
  v_sender  text;
begin
  begin
    select coalesce(pp.full_name, 'Phụ huynh'), coalesce(tp.full_name, 'Giáo viên') into v_parent, v_teacher
    from public.chat_conversations c
    left join public.profiles pp on pp.id = c.parent_id
    left join public.profiles tp on tp.id = c.teacher_id
    where c.id = new.conversation_id;
    select coalesce(full_name, '') into v_sender from public.profiles where id = new.sender_id;
    perform public.admin_feed_push('chat', new.sender_id, 'chat:' || new.conversation_id,
      'Tin nhắn: ' || coalesce(v_parent, '') || ' ↔ ' || coalesce(v_teacher, ''),
      v_sender || ': ' || coalesce(left(regexp_replace(trim(new.body), '\s+', ' ', 'g'), 140), '📷 Hình ảnh'),
      '/admin/chat?c=' || new.conversation_id);
  exception when others then raise warning 'admin_feed_chat: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_chat on public.chat_messages;
create trigger admin_feed_chat after insert on public.chat_messages
  for each row execute function public.admin_feed_chat();

-- -----------------------------------------------------------------------------
-- 4. Bài tập: giáo viên giao bài; phụ huynh nộp bài (gộp theo bài); giáo viên chấm (gộp theo cô / ngày)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_homework_assigned()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.admin_feed_push('homework', coalesce(new.teacher_id, (select auth.uid())), null,
      'Bài tập mới cho lớp ' || new.class_name,
      new.title || case when new.due_date is not null then ' · hạn ' || to_char(new.due_date, 'DD/MM') else '' end,
      '/admin/grading?tab=assign');
  exception when others then raise warning 'admin_feed_homework_assigned: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_homework_assigned on public.homework_assignments;
create trigger admin_feed_homework_assigned after insert on public.homework_assignments
  for each row execute function public.admin_feed_homework_assigned();

create or replace function public.admin_feed_homework_submission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_title   text;
  v_student text := public.admin_feed_student_label(new.student_id);
begin
  begin
    select a.title into v_title from public.homework_assignments a where a.id = new.assignment_id;
    if tg_op = 'INSERT' then
      perform public.admin_feed_push('homework', new.parent_id, 'hw-submit:' || new.assignment_id,
        'Phụ huynh nộp bài: ' || coalesce(v_title, ''),
        'Mới nhất: bé ' || coalesce(v_student, ''),
        '/admin/grading');
    elsif new.status = 'graded' and (old.status is distinct from 'graded') then
      perform public.admin_feed_push('homework', coalesce(new.graded_by, (select auth.uid())),
        'hw-grade:' || coalesce(new.graded_by, (select auth.uid())) || ':' || (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        'Giáo viên chấm bài tập',
        'Mới nhất: bé ' || coalesce(v_student, '') || ' · ' || coalesce(v_title, '') || ' · ' || coalesce(new.stars, 0) || ' sao',
        '/admin/grading?view=graded');
    end if;
  exception when others then raise warning 'admin_feed_homework_submission: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_homework_submission on public.homework_submissions;
create trigger admin_feed_homework_submission after insert or update of status on public.homework_submissions
  for each row execute function public.admin_feed_homework_submission();

-- -----------------------------------------------------------------------------
-- 5. Sổ liên lạc (gộp theo giáo viên / ngày)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_daily_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.teacher_id);
begin
  begin
    perform public.admin_feed_push('daily_report', v_actor, 'daily:' || v_actor || ':' || new.date,
      'Sổ liên lạc ngày ' || to_char(new.date, 'DD/MM'),
      'Mới nhất: bé ' || coalesce(public.admin_feed_student_label(new.student_id), ''),
      '/admin/daily-report');
  exception when others then raise warning 'admin_feed_daily_report: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_daily_report on public.daily_reports;
create trigger admin_feed_daily_report after insert on public.daily_reports
  for each row execute function public.admin_feed_daily_report();

-- -----------------------------------------------------------------------------
-- 6. Điểm danh (gộp theo lớp / ngày, kèm số liệu cả lớp)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_attendance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_campus  public.campus;
  v_class   text;
  v_counts  record;
begin
  -- Điểm danh do duyệt đơn nghỉ tự ghi → đã có thông báo "đồng ý đơn"
  if coalesce(current_setting('thedu.skip_attendance_notify', true), '') = 'on' then
    return new;
  end if;
  begin
    select s.campus, s.class_name into v_campus, v_class from public.students s where s.id = new.student_id;
    select count(*) filter (where a.status::text = 'present') as present,
           count(*) filter (where a.status::text = 'late') as late,
           count(*) filter (where a.status::text = 'absent') as absent,
           count(*) filter (where a.status::text = 'absent_with_permission') as excused
      into v_counts
    from public.attendance a join public.students s on s.id = a.student_id
    where a.date = new.date and s.campus = v_campus and s.class_name = v_class;
    perform public.admin_feed_push('attendance', (select auth.uid()), 'att:' || v_campus || ':' || v_class || ':' || new.date,
      'Điểm danh lớp ' || v_class || ' · ' || to_char(new.date, 'DD/MM'),
      v_counts.present || ' có mặt · ' || v_counts.late || ' muộn · ' || v_counts.absent || ' vắng'
        || case when v_counts.excused > 0 then ' · ' || v_counts.excused || ' có phép' else '' end,
      '/admin/attendance');
  exception when others then raise warning 'admin_feed_attendance: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_attendance on public.attendance;
create trigger admin_feed_attendance after insert or update of status on public.attendance
  for each row execute function public.admin_feed_attendance();

-- -----------------------------------------------------------------------------
-- 7. Tổng kết tháng gửi phụ huynh (gộp theo giáo viên / tháng)
-- -----------------------------------------------------------------------------
create or replace function public.admin_feed_summary()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.teacher_id);
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') then
    return new;
  end if;
  begin
    perform public.admin_feed_push('summary', v_actor, 'summary:' || v_actor || ':' || new.month,
      'Gửi tổng kết tháng ' || to_char(new.month, 'MM/YYYY'),
      'Mới nhất: bé ' || coalesce(public.admin_feed_student_label(new.student_id), ''),
      '/admin/student-analytics');
  exception when others then raise warning 'admin_feed_summary: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admin_feed_summary on public.monthly_summaries;
create trigger admin_feed_summary after insert or update of status on public.monthly_summaries
  for each row execute function public.admin_feed_summary();

-- -----------------------------------------------------------------------------
-- Realtime: chuông của quản trị viên cập nhật ngay
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications') then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;
