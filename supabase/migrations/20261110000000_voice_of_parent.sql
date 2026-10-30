-- =============================================================================
-- Lắng nghe phụ huynh & đánh giá chất lượng dịch vụ.
--
--  A. Góp ý & hỗ trợ (bảng feedback có sẵn) — bổ sung:
--     - Loại: góp ý / báo lỗi / thắc mắc; chủ đề thêm "Chương trình học", "Ứng dụng".
--     - GỬI ẨN DANH THẬT SỰ: feedback.parent_id = NULL, người gửi lưu ở feedback_anonymous_owners — chỉ chính phụ huynh
--       đó đọc được (xem lại góp ý + trả lời), quản trị viên KHÔNG đọc được. Thông báo trả lời vẫn tới đúng người,
--       nhưng quản trị viên không đọc được dòng thông báo đó (không suy ngược ra người gửi).
--     - Gửi kèm thông tin liên hệ (tên, SĐT, muốn được gọi lại) khi không ẩn danh.
--     - Thông báo cho phụ huynh cả khi đổi trạng thái (đang giải quyết / đã hoàn tất), không chỉ khi trả lời.
--     - Gửi qua RPC submit_feedback() (kiểm tra quyền + dữ liệu trong DB).
--  B. Khảo sát hài lòng định kỳ (satisfaction_surveys): mỗi phụ huynh 1 lần / tháng, 1–5 sao chung + từng môn
--     (Tiền tiểu học, Luyện chữ đẹp, Toán tư duy) + nhận xét ngắn; chấm ≤ 2 sao → báo ngay cho quản trị viên.
--
-- Cần đã chạy: apply-feedback-migration.sql, apply-admin-activity-feed.sql. Chạy lại nhiều lần vẫn an toàn.
-- Enum mới không dùng; giá trị enum cũ dùng bình thường.
-- =============================================================================
begin;

-- =============================================================================
-- A. GÓP Ý & HỖ TRỢ
-- =============================================================================
alter table public.feedback add column if not exists kind text not null default 'gop_y';
alter table public.feedback add column if not exists is_anonymous boolean not null default false;
alter table public.feedback add column if not exists contact_name text;
alter table public.feedback add column if not exists contact_phone text;
alter table public.feedback add column if not exists wants_callback boolean not null default false;
alter table public.feedback add column if not exists status_changed_at timestamptz;
alter table public.feedback alter column parent_id drop not null;

alter table public.feedback drop constraint if exists feedback_kind_valid;
alter table public.feedback add constraint feedback_kind_valid check (kind in ('gop_y', 'bao_loi', 'thac_mac'));

alter table public.feedback drop constraint if exists feedback_category_valid;
alter table public.feedback add constraint feedback_category_valid
  check (category in ('hoc_phi', 'chuong_trinh', 'giao_vien', 'co_so_vat_chat', 'ung_dung', 'hoc_tap', 'lich_hoc', 'khac'));

alter table public.feedback drop constraint if exists feedback_contact_valid;
alter table public.feedback add constraint feedback_contact_valid check (
  (contact_name is null or length(contact_name) <= 100)
  and (contact_phone is null or contact_phone ~ '^\+?[0-9]{9,15}$')
);

-- Ẩn danh: không người gửi, không bé, không thông tin liên hệ. Không ẩn danh: phải có người gửi.
alter table public.feedback drop constraint if exists feedback_anonymous_valid;
alter table public.feedback add constraint feedback_anonymous_valid check (
  (is_anonymous and parent_id is null and student_id is null and contact_name is null and contact_phone is null and not wants_callback)
  or (not is_anonymous and parent_id is not null)
);

create index if not exists feedback_category_idx on public.feedback (category, created_at desc);

-- Người gửi góp ý ẩn danh — CHỈ chính phụ huynh đó đọc được (không có policy cho quản trị viên)
create table if not exists public.feedback_anonymous_owners (
  feedback_id  uuid primary key references public.feedback (id) on delete cascade,
  parent_id    uuid not null references public.profiles (id) on delete cascade
);
create index if not exists feedback_anonymous_owners_parent_idx on public.feedback_anonymous_owners (parent_id);
alter table public.feedback_anonymous_owners enable row level security;
revoke all on public.feedback_anonymous_owners from anon, authenticated;
grant select on public.feedback_anonymous_owners to authenticated;
drop policy if exists "feedback_anon_owner_select" on public.feedback_anonymous_owners;
create policy "feedback_anon_owner_select" on public.feedback_anonymous_owners
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- Phụ huynh xem góp ý của mình: đứng tên HOẶC ẩn danh do chính mình gửi
drop policy if exists "feedback_parent_select" on public.feedback;
create policy "feedback_parent_select" on public.feedback
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or exists (select 1 from public.feedback_anonymous_owners o where o.feedback_id = feedback.id and o.parent_id = (select auth.uid()))
  );

-- Gửi trực tiếp vào bảng chỉ cho góp ý đứng tên; ẩn danh đi qua submit_feedback()
drop policy if exists "feedback_parent_insert" on public.feedback;
create policy "feedback_parent_insert" on public.feedback
  for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and not is_anonymous
    and status = 'new'
    and admin_reply is null
    and replied_by is null
    and replied_at is null
    and (student_id is null or public.is_parent_of(student_id))
  );

create or replace function public.feedback_is_anonymous(p_feedback_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select f.is_anonymous from public.feedback f where f.id = p_feedback_id), false);
$$;

-- Quản trị viên không đọc được thông báo trả lời góp ý ẩn danh (dòng đó lộ người nhận = người gửi)
drop policy if exists "admin_select_notifications" on public.notifications;
create policy "admin_select_notifications" on public.notifications
  for select to authenticated
  using ((select public.is_admin()) and (feedback_id is null or not public.feedback_is_anonymous(feedback_id)));

-- Gửi góp ý (đứng tên hoặc ẩn danh). Trả về id.
create or replace function public.submit_feedback(
  p_kind text,
  p_category text,
  p_content text,
  p_student_id uuid default null,
  p_anonymous boolean default false,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_wants_callback boolean default false
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null or public.current_user_role() <> 'parent' then
    raise exception 'Chỉ phụ huynh được gửi góp ý' using errcode = '42501';
  end if;
  if p_student_id is not null and not p_anonymous and not public.is_parent_of(p_student_id) then
    raise exception 'Không gửi được góp ý cho học sinh này' using errcode = '42501';
  end if;

  insert into public.feedback (parent_id, student_id, kind, category, content, is_anonymous, contact_name, contact_phone, wants_callback)
  values (
    case when p_anonymous then null else v_uid end,
    case when p_anonymous then null else p_student_id end,
    p_kind,
    p_category,
    trim(p_content),
    p_anonymous,
    case when p_anonymous then null else nullif(trim(p_contact_name), '') end,
    case when p_anonymous then null else nullif(trim(p_contact_phone), '') end,
    case when p_anonymous then false else coalesce(p_wants_callback, false) end
  )
  returning id into v_id;

  if p_anonymous then
    insert into public.feedback_anonymous_owners (feedback_id, parent_id) values (v_id, v_uid);
  end if;
  return v_id;
end;
$$;

-- Đổi trạng thái → ghi mốc
create or replace function public.feedback_touch_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists feedback_touch_status on public.feedback;
create trigger feedback_touch_status before update on public.feedback
  for each row execute function public.feedback_touch_status();

-- Thông báo cho phụ huynh: khi trả lời (như cũ) VÀ khi đổi trạng thái. Ẩn danh → người nhận lấy từ bảng chủ sở hữu.
create or replace function public.feedback_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_recipient uuid;
  v_title     text;
  v_body      text;
  v_reply_changed  boolean := new.admin_reply is not null and trim(new.admin_reply) <> ''
                              and (tg_op = 'INSERT' or new.admin_reply is distinct from old.admin_reply);
  v_status_changed boolean := tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'new';
begin
  if not v_reply_changed and not v_status_changed then
    return new;
  end if;

  v_recipient := coalesce(new.parent_id, (select o.parent_id from public.feedback_anonymous_owners o where o.feedback_id = new.id));
  if v_recipient is null then
    return new;
  end if;

  if v_reply_changed then
    v_title := case when new.status = 'resolved' then 'Nhà trường đã trả lời & hoàn tất góp ý của anh/chị'
                    else 'Nhà trường đã trả lời góp ý của anh/chị' end;
    v_body := trim(new.admin_reply);
  elsif new.status = 'in_progress' then
    v_title := 'Góp ý của anh/chị đang được giải quyết';
    v_body := 'Ban Giám đốc đã tiếp nhận: “' || left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 100) || '”';
  else
    v_title := 'Góp ý của anh/chị đã được xử lý xong';
    v_body := coalesce(nullif(trim(new.admin_reply), ''), 'Cảm ơn anh/chị đã đồng hành cùng TH EDU.');
  end if;
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;

  insert into public.notifications (recipient_id, student_id, feedback_id, type, ref_date, title, body)
  values (v_recipient, new.student_id, new.id, 'feedback'::text::public.notification_type,
          (now() at time zone 'Asia/Ho_Chi_Minh')::date, v_title, v_body)
  on conflict (feedback_id) where feedback_id is not null do update
    set title      = excluded.title,
        body       = excluded.body,
        ref_date   = excluded.ref_date,
        read_at    = null,
        pushed_at  = null,
        created_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_reply_notify on public.feedback;
create trigger feedback_reply_notify
  after insert or update of admin_reply, status on public.feedback
  for each row execute function public.feedback_reply_notify();

-- Thông báo hoạt động cho quản trị viên. Ẩn danh → ghi thẳng, không gắn người gửi
-- (admin_feed_push bỏ qua sự kiện không có người thực hiện; vai trò 'system' có từ apply-bank-reconcile.sql).
create or replace function public.admin_feed_feedback()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind  text := case new.kind when 'bao_loi' then 'Báo lỗi' when 'thac_mac' then 'Thắc mắc' else 'Góp ý' end;
  v_body  text := left(regexp_replace(trim(new.content), '\s+', ' ', 'g'), 160);
begin
  begin
    if new.is_anonymous then
      insert into public.admin_notifications (category, actor_id, actor_role, actor_name, title, body, href)
      values ('feedback', null, 'system', 'Phụ huynh (ẩn danh)', v_kind || ' ẩn danh', v_body, '/admin/feedback');
    else
      perform public.admin_feed_push(
        'feedback', new.parent_id, null,
        v_kind || ' mới từ phụ huynh' || case when new.wants_callback then ' · muốn được gọi lại' else '' end,
        v_body, '/admin/feedback'
      );
    end if;
  exception when others then raise warning 'admin_feed_feedback: %', sqlerrm;
  end;
  return new;
end;
$$;

-- =============================================================================
-- B. KHẢO SÁT HÀI LÒNG ĐỊNH KỲ
-- =============================================================================
create table if not exists public.satisfaction_surveys (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null references public.profiles (id) on delete cascade,
  period           date not null,                 -- ngày đầu tháng được khảo sát
  status           text not null default 'answered',
  rating           smallint,
  subject_ratings  jsonb not null default '{}'::jsonb,  -- {"tien_tieu_hoc": 1..5, "luyen_chu": .., "toan_tu_duy": ..}
  comment          text,
  campuses         text[] not null default '{}',  -- ảnh chụp cơ sở / lớp lúc trả lời (thống kê theo cơ sở)
  class_names      text[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint satisfaction_surveys_once_per_month unique (parent_id, period),
  constraint satisfaction_surveys_period_month check (extract(day from period) = 1),
  constraint satisfaction_surveys_status check (status in ('answered', 'declined')),
  constraint satisfaction_surveys_rating check (
    (status = 'declined' and rating is null) or (status = 'answered' and rating between 1 and 5)
  ),
  constraint satisfaction_surveys_subjects check (jsonb_typeof(subject_ratings) = 'object'),
  constraint satisfaction_surveys_comment check (comment is null or length(comment) <= 500)
);
create index if not exists satisfaction_surveys_period_idx on public.satisfaction_surveys (period, status);

alter table public.satisfaction_surveys enable row level security;
revoke all on public.satisfaction_surveys from anon;

drop policy if exists "surveys_parent_insert" on public.satisfaction_surveys;
create policy "surveys_parent_insert" on public.satisfaction_surveys
  for insert to authenticated
  with check (parent_id = (select auth.uid()) and (select public.current_user_role()) = 'parent');

drop policy if exists "surveys_parent_select" on public.satisfaction_surveys;
create policy "surveys_parent_select" on public.satisfaction_surveys
  for select to authenticated
  using (parent_id = (select auth.uid()));

drop policy if exists "surveys_admin_select" on public.satisfaction_surveys;
create policy "surveys_admin_select" on public.satisfaction_surveys
  for select to authenticated
  using ((select public.is_admin()));

-- Trước khi lưu: chỉ giữ điểm môn hợp lệ (1–5, đúng 3 môn), chụp cơ sở / lớp của các con
create or replace function public.satisfaction_survey_prepare()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.subject_ratings := coalesce((
    select jsonb_object_agg(key, value)
    from jsonb_each(new.subject_ratings)
    where key in ('tien_tieu_hoc', 'luyen_chu', 'toan_tu_duy')
      and jsonb_typeof(value) = 'number' and (value::text)::numeric between 1 and 5
  ), '{}'::jsonb);
  if new.status = 'declined' then
    new.subject_ratings := '{}'::jsonb;
    new.comment := null;
  end if;
  new.comment := nullif(trim(new.comment), '');
  select coalesce(array_agg(distinct s.campus::text), '{}'), coalesce(array_agg(distinct s.class_name), '{}')
    into new.campuses, new.class_names
    from public.students s where s.parent_id = new.parent_id;
  return new;
end;
$$;
drop trigger if exists satisfaction_survey_prepare on public.satisfaction_surveys;
create trigger satisfaction_survey_prepare before insert on public.satisfaction_surveys
  for each row execute function public.satisfaction_survey_prepare();

-- Chấm thấp (≤ 2 sao) → báo ngay quản trị viên để chăm sóc phụ huynh
create or replace function public.satisfaction_survey_alert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'answered' and new.rating <= 2 then
    begin
      perform public.admin_feed_push(
        'feedback', new.parent_id, null,
        'Khảo sát hài lòng: phụ huynh chấm ' || new.rating || '★',
        coalesce(left(new.comment, 160), 'Không kèm nhận xét') || ' · ' || array_to_string(new.class_names, ', '),
        '/admin/feedback?tab=survey'
      );
    exception when others then raise warning 'satisfaction_survey_alert: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists satisfaction_survey_alert on public.satisfaction_surveys;
create trigger satisfaction_survey_alert after insert on public.satisfaction_surveys
  for each row execute function public.satisfaction_survey_alert();

-- Quyền gọi hàm (đồng bộ với chính sách chung của migration bảo mật)
revoke execute on function public.submit_feedback(text, text, text, uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.submit_feedback(text, text, text, uuid, boolean, text, text, boolean) to authenticated;
revoke execute on function public.feedback_is_anonymous(uuid) from public, anon;
grant execute on function public.feedback_is_anonymous(uuid) to authenticated;
revoke execute on function public.feedback_touch_status() from public, anon, authenticated;
revoke execute on function public.satisfaction_survey_prepare() from public, anon, authenticated;
revoke execute on function public.satisfaction_survey_alert() from public, anon, authenticated;

commit;
