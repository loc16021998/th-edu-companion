-- =============================================================================
-- CRM Tuyển sinh: học sinh tiềm năng (leads) + lớp học trải nghiệm (trial_classes).
--
--  - leads: thông tin bé + phụ huynh, chương trình quan tâm, trạng thái tư vấn
--    new → contacted → trial_booked → enrolled | lost.
--  - trial_classes: lịch học thử (cơ sở, lớp, giáo viên, giờ), trạng thái gửi tin xác nhận,
--    đánh giá nhanh năng lực ban đầu của giáo viên sau buổi học.
--  - Chỉ quản trị viên (Quản lý / Tư vấn viên) đọc / sửa trực tiếp 2 bảng. Giáo viên KHÔNG thấy SĐT phụ huynh:
--    chỉ xem buổi học thử được phân công + chấm đánh giá qua RPC teacher_trial_classes() / submit_trial_assessment().
--  - Phân công giáo viên → thông báo "Lịch học thử" cho cô. Cô gửi đánh giá → bảng tin quản trị (mục Tuyển sinh).
--  - convert_lead_to_student(): tạo học sinh + khoản học phí đầu tiên + đánh dấu lead "Đã nhập học" trong 1 giao dịch
--    (tài khoản phụ huynh do server tạo trước bằng service role).
--
-- Cần đã chạy: apply-security-audit.sql (nhật ký thay đổi), apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- Giá trị enum mới thêm NGOÀI giao dịch (lỗi 55P04); các hàm dùng phép ép kiểu từ text khi chạy.
-- =============================================================================

alter type public.notification_type add value if not exists 'trial_assigned';

begin;

-- -----------------------------------------------------------------------------
-- 1. Bảng
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null,
  dob                   date,
  parent_name           text not null,
  phone                 text not null,
  target_program        text not null,
  campus                public.campus not null,
  source                text not null default 'khac',
  status                text not null default 'new',
  notes                 text,
  lost_reason           text,
  follow_up_on          date,
  assigned_to           uuid references public.profiles (id) on delete set null,
  converted_student_id  uuid references public.students (id) on delete set null,
  converted_at          timestamptz,
  status_changed_at     timestamptz not null default now(),
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint leads_full_name_len   check (length(trim(full_name)) between 2 and 100),
  constraint leads_parent_name_len check (length(trim(parent_name)) between 2 and 100),
  constraint leads_phone_valid     check (phone ~ '^\+[0-9]{9,15}$'),
  constraint leads_program_valid   check (target_program in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy')),
  constraint leads_source_valid    check (source in ('facebook', 'zalo', 'gioi_thieu', 'walk_in', 'website', 'hotline', 'khac')),
  constraint leads_status_valid    check (status in ('new', 'contacted', 'trial_booked', 'enrolled', 'lost')),
  constraint leads_notes_len       check (notes is null or length(notes) <= 2000),
  constraint leads_lost_reason_len check (lost_reason is null or length(lost_reason) <= 300),
  constraint leads_dob_past        check (dob is null or dob <= current_date)
);
comment on table public.leads is 'CRM tuyển sinh — học sinh tiềm năng. Chỉ quản trị viên (RLS).';
create index if not exists leads_status_idx on public.leads (status, updated_at desc);
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_campus_idx on public.leads (campus, status);

create table if not exists public.trial_classes (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.leads (id) on delete cascade,
  campus               public.campus not null,
  class_id             uuid references public.classes (id) on delete set null,
  teacher_id           uuid references public.profiles (id) on delete set null,
  program              text not null,
  scheduled_at         timestamptz not null,
  duration_minutes     smallint not null default 60,
  status               text not null default 'scheduled',
  note_for_teacher     text,
  confirmation_status  text not null default 'pending',
  confirmed_at         timestamptz,
  assessment_level     smallint,
  assessment_skills    jsonb not null default '{}'::jsonb,
  strengths            text,
  improvements         text,
  recommendation       text,
  assessed_by          uuid references public.profiles (id) on delete set null,
  assessed_at          timestamptz,
  created_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint trial_program_valid       check (program in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy')),
  constraint trial_duration_valid      check (duration_minutes between 15 and 240),
  constraint trial_status_valid        check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  constraint trial_confirmation_valid  check (confirmation_status in ('pending', 'sent', 'manual', 'failed')),
  constraint trial_level_valid         check (assessment_level is null or assessment_level between 1 and 4),
  constraint trial_skills_is_object    check (jsonb_typeof(assessment_skills) = 'object'),
  constraint trial_note_len            check (note_for_teacher is null or length(note_for_teacher) <= 1000),
  constraint trial_text_len            check (
    (strengths is null or length(strengths) <= 1000)
    and (improvements is null or length(improvements) <= 1000)
    and (recommendation is null or length(recommendation) <= 1000)
  )
);
comment on table public.trial_classes is 'Lịch học thử của học sinh tiềm năng + đánh giá nhanh của giáo viên.';
create index if not exists trial_classes_lead_idx on public.trial_classes (lead_id, scheduled_at desc);
create index if not exists trial_classes_schedule_idx on public.trial_classes (scheduled_at);
create index if not exists trial_classes_teacher_idx on public.trial_classes (teacher_id, scheduled_at desc) where teacher_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Quyền: chỉ quản trị viên truy cập bảng trực tiếp
-- -----------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.trial_classes enable row level security;
revoke all on public.leads, public.trial_classes from anon;
grant select, insert, update, delete on public.leads, public.trial_classes to authenticated;

drop policy if exists "admin_all_leads" on public.leads;
create policy "admin_all_leads" on public.leads
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_trial_classes" on public.trial_classes;
create policy "admin_all_trial_classes" on public.trial_classes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 3. Trigger
-- -----------------------------------------------------------------------------
create or replace function public.leads_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if new.status <> 'lost' then
    new.lost_reason := null;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before insert or update on public.leads
  for each row execute function public.leads_touch();

create or replace function public.trial_classes_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Đổi giờ học → cần gửi lại tin xác nhận
  if tg_op = 'UPDATE' and new.scheduled_at is distinct from old.scheduled_at and new.confirmation_status = old.confirmation_status then
    new.confirmation_status := 'pending';
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trial_classes_touch on public.trial_classes;
create trigger trial_classes_touch before insert or update on public.trial_classes
  for each row execute function public.trial_classes_touch();

-- Đặt lịch học thử → lead chuyển sang "Đã hẹn học thử" (nếu đang ở bước trước đó)
create or replace function public.trial_classes_sync_lead()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'scheduled' then
    update public.leads set status = 'trial_booked'
    where id = new.lead_id and status in ('new', 'contacted');
  end if;
  return new;
end;
$$;
drop trigger if exists trial_classes_sync_lead on public.trial_classes;
create trigger trial_classes_sync_lead after insert on public.trial_classes
  for each row execute function public.trial_classes_sync_lead();

-- Phân công giáo viên / đổi giờ → thông báo "Lịch học thử" cho cô (không kèm SĐT phụ huynh). Huỷ → gỡ thông báo.
create or replace function public.trial_classes_notify_teacher()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_child   text;
  v_program text;
  v_when    text;
begin
  if tg_op = 'UPDATE'
     and new.teacher_id is not distinct from old.teacher_id
     and new.scheduled_at is not distinct from old.scheduled_at
     and new.status is not distinct from old.status then
    return new;
  end if;

  delete from public.notifications where type = 'trial_assigned'::text::public.notification_type and ref_id = new.id;
  if new.teacher_id is null or new.status <> 'scheduled' then
    return new;
  end if;

  select l.full_name into v_child from public.leads l where l.id = new.lead_id;
  v_program := case new.program when 'tien_tieu_hoc' then 'Tiền tiểu học' when 'luyen_chu' then 'Luyện chữ đẹp' else 'Toán tư duy' end;
  v_when := to_char(new.scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM');

  begin
    insert into public.notifications (recipient_id, student_id, type, ref_date, ref_id, title, body)
    values (
      new.teacher_id, null, 'trial_assigned'::text::public.notification_type,
      (new.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date, new.id,
      'Lịch học thử: bé ' || coalesce(v_child, ''),
      v_program || ' · ' || v_when || ' · ' || case new.campus when 'CS1_XALA' then 'CS1 Xa La' else 'CS2 Ngô Thì Nhậm' end
        || ' — cô đánh giá nhanh sau buổi học nhé.'
    );
  exception when others then raise warning 'trial_classes_notify_teacher: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trial_classes_notify_teacher on public.trial_classes;
create trigger trial_classes_notify_teacher
  after insert or update of teacher_id, scheduled_at, status on public.trial_classes
  for each row execute function public.trial_classes_notify_teacher();

-- Bảng tin quản trị: thêm mục "Tuyển sinh"
alter table public.admin_notifications drop constraint if exists admin_notifications_category_valid;
alter table public.admin_notifications add constraint admin_notifications_category_valid
  check (category in ('feedback', 'leave', 'chat', 'homework', 'daily_report', 'attendance', 'summary', 'payment', 'admissions'));

-- Nhật ký thay đổi (bảng audit_logs từ apply-security-audit.sql)
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.leads;
    create trigger audit_row_change after insert or update or delete on public.leads
      for each row execute function public.audit_row_change();
    drop trigger if exists audit_row_change on public.trial_classes;
    create trigger audit_row_change after insert or update or delete on public.trial_classes
      for each row execute function public.audit_row_change();
  else
    raise notice 'Chưa có audit_row_change() — bỏ qua nhật ký cho bảng tuyển sinh';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. RPC cho giáo viên: chỉ buổi học thử được phân công, không có SĐT / ghi chú tư vấn
-- -----------------------------------------------------------------------------
create or replace function public.teacher_trial_classes()
returns table (
  id                uuid,
  scheduled_at      timestamptz,
  duration_minutes  smallint,
  program           text,
  status            text,
  campus            public.campus,
  class_name        text,
  child_name        text,
  child_dob         date,
  note_for_teacher  text,
  assessment_level  smallint,
  assessment_skills jsonb,
  strengths         text,
  improvements      text,
  recommendation    text,
  assessed_at       timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.scheduled_at, t.duration_minutes, t.program, t.status, t.campus, c.name, l.full_name, l.dob,
         t.note_for_teacher, t.assessment_level, t.assessment_skills, t.strengths, t.improvements, t.recommendation, t.assessed_at
  from public.trial_classes t
  join public.leads l on l.id = t.lead_id
  left join public.classes c on c.id = t.class_id
  where t.teacher_id = (select auth.uid())
    and t.status <> 'cancelled'
    and t.scheduled_at > now() - interval '60 days'
  order by t.scheduled_at desc
  limit 100;
$$;

create or replace function public.submit_trial_assessment(
  p_trial          uuid,
  p_attended       boolean,
  p_level          smallint default null,
  p_skills         jsonb default '{}'::jsonb,
  p_strengths      text default null,
  p_improvements   text default null,
  p_recommendation text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_trial public.trial_classes;
  v_child text;
  k       text;
  v       jsonb;
begin
  select * into v_trial from public.trial_classes where id = p_trial for update;
  if v_trial.id is null then
    raise exception 'Không tìm thấy buổi học thử' using errcode = 'P0002';
  end if;
  if v_uid is null or not (v_trial.teacher_id = v_uid or public.is_admin()) then
    raise exception 'Buổi học thử này không được phân công cho bạn' using errcode = '42501';
  end if;
  if v_trial.status = 'cancelled' then
    raise exception 'Buổi học thử đã huỷ' using errcode = '22023';
  end if;
  if v_trial.scheduled_at > now() + interval '30 minutes' then
    raise exception 'Chưa tới giờ học thử' using errcode = '22023';
  end if;

  if not coalesce(p_attended, false) then
    update public.trial_classes
    set status = 'no_show', assessed_by = v_uid, assessed_at = now()
    where id = p_trial;
    return;
  end if;

  if p_level is null or p_level not between 1 and 4 then
    raise exception 'Vui lòng chọn mức năng lực' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_skills, '{}'::jsonb)) <> 'object' then
    raise exception 'Đánh giá kỹ năng không hợp lệ' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_skills, '{}'::jsonb)) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not in (1, 2, 3, 4, 5) or length(k) > 40 then
      raise exception 'Điểm kỹ năng phải từ 1 đến 5' using errcode = '22023';
    end if;
  end loop;

  update public.trial_classes
  set status            = 'completed',
      assessment_level  = p_level,
      assessment_skills = coalesce(p_skills, '{}'::jsonb),
      strengths         = nullif(left(trim(p_strengths), 1000), ''),
      improvements      = nullif(left(trim(p_improvements), 1000), ''),
      recommendation    = nullif(left(trim(p_recommendation), 1000), ''),
      assessed_by       = v_uid,
      assessed_at       = now()
  where id = p_trial;

  select l.full_name into v_child from public.leads l where l.id = v_trial.lead_id;
  begin
    perform public.admin_feed_push(
      'admissions', v_uid, null,
      'Đã đánh giá học thử: bé ' || coalesce(v_child, ''),
      'Mức: ' || case p_level when 1 then 'Cần hỗ trợ thêm' when 2 then 'Đạt yêu cầu' when 3 then 'Khá tốt' else 'Nổi trội' end
        || coalesce(' · ' || left(trim(p_recommendation), 120), ''),
      '/admin/admissions/trials#t-' || p_trial
    );
  exception when others then raise warning 'submit_trial_assessment feed: %', sqlerrm;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Chuyển lead thành học viên chính thức (1 giao dịch: học sinh + học phí đầu + cập nhật lead)
-- -----------------------------------------------------------------------------
create or replace function public.convert_lead_to_student(
  p_lead       uuid,
  p_parent     uuid,
  p_class      uuid,
  p_full_name  text,
  p_dob        date,
  p_subjects   text[],
  p_fee_title  text,
  p_fee_amount numeric,
  p_fee_due    date
)
returns table (student_id uuid, fee_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_class   public.classes;
  v_student uuid;
  v_fee     uuid;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được chuyển học viên' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead for update;
  if v_lead.id is null then
    raise exception 'Không tìm thấy học sinh tiềm năng' using errcode = 'P0002';
  end if;
  if v_lead.converted_student_id is not null then
    raise exception 'Học sinh này đã được chuyển thành học viên' using errcode = '23505';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_parent and p.role = 'parent') then
    raise exception 'Tài khoản phụ huynh không hợp lệ' using errcode = '22023';
  end if;
  select * into v_class from public.classes where id = p_class;
  if v_class.id is null then
    raise exception 'Lớp không tồn tại' using errcode = '22023';
  end if;
  if p_fee_amount is null or p_fee_amount < 0 or length(trim(coalesce(p_fee_title, ''))) = 0 then
    raise exception 'Học phí không hợp lệ' using errcode = '22023';
  end if;

  insert into public.students (full_name, dob, campus, class_name, parent_id, subjects)
  values (trim(p_full_name), p_dob, v_class.campus, v_class.name, p_parent, p_subjects)
  returning id into v_student;

  insert into public.fees (student_id, title, amount, due_date)
  values (v_student, trim(p_fee_title), round(p_fee_amount), p_fee_due)
  returning id into v_fee;

  update public.leads
  set status = 'enrolled', converted_student_id = v_student, converted_at = now()
  where id = p_lead;

  return query select v_student, v_fee;
end;
$$;

-- Quyền gọi hàm
revoke execute on function public.teacher_trial_classes() from public, anon;
grant execute on function public.teacher_trial_classes() to authenticated;
revoke execute on function public.submit_trial_assessment(uuid, boolean, smallint, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_trial_assessment(uuid, boolean, smallint, jsonb, text, text, text) to authenticated;
revoke execute on function public.convert_lead_to_student(uuid, uuid, uuid, text, date, text[], text, numeric, date) from public, anon;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, text, date, text[], text, numeric, date) to authenticated;
revoke execute on function public.leads_touch() from public, anon, authenticated;
revoke execute on function public.trial_classes_touch() from public, anon, authenticated;
revoke execute on function public.trial_classes_sync_lead() from public, anon, authenticated;
revoke execute on function public.trial_classes_notify_teacher() from public, anon, authenticated;

commit;
