-- =============================================================================
-- Bảng Vàng Thi Đua & Huy Hiệu Sao (Góc Thành tích).
--
--  A. achievement_badges: danh mục huy hiệu vinh danh ("Cây bút vàng", "Siêu nhân tính nhẩm"…). Mọi người đã đăng nhập
--     ĐỌC được; quản trị viên thêm / sửa / ẩn (không xoá huy hiệu đã trao — chỉ ẩn để giữ bộ sưu tập của bé).
--  B. student_star_awards: sao (1–3) cô tặng bé sau MỖI BUỔI HỌC — 1 dòng / bé / ngày (sửa lại được).
--  C. student_badge_awards: huy hiệu cô trao — mỗi huy hiệu tối đa 1 lần / bé / ngày.
--     Giáo viên chỉ trao cho bé lớp mình phụ trách, trong 7 ngày gần nhất (không ghi ngày tương lai); quản trị viên: mọi lúc.
--  D. reward_milestones + reward_redemptions: mốc quà theo TỔNG SAO TÍCH LUỸ (sao buổi học + sao bài tập về nhà)
--     và việc cô đã trao quà cho bé.
--  E. student_star_totals(): tổng sao của các bé (theo RLS người gọi).
--     class_achievement_leaderboard(): bảng vàng của lớp — phụ huynh chỉ thấy TÊN GỌI các bạn (như bảng sao bài tập).
--  F. Thông báo cho phụ huynh: gộp 1 thông báo / bé / ngày ("Bé An nhận 3⭐ + huy hiệu Cây bút vàng"),
--     huy hiệu mới → thông báo lại hiện "chưa đọc" và được đẩy (push) lại.
--
-- Cần đã chạy: apply-homework (bảng homework_submissions). Chạy lại nhiều lần vẫn an toàn. Giá trị enum mới thêm ngoài giao dịch.
-- =============================================================================

alter type public.notification_type add value if not exists 'achievement';

begin;

-- -----------------------------------------------------------------------------
-- A. Danh mục huy hiệu
-- -----------------------------------------------------------------------------
create table if not exists public.achievement_badges (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  emoji        text not null default '🏅',
  description  text,
  tone         text not null default 'amber',
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint achievement_badges_code_valid check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint achievement_badges_text_len check (
    length(name) between 2 and 40 and length(emoji) between 1 and 16 and (description is null or length(description) <= 160)
  ),
  constraint achievement_badges_tone_valid check (tone in ('amber', 'rose', 'sky', 'emerald', 'violet', 'orange'))
);
comment on table public.achievement_badges is 'Danh mục huy hiệu vinh danh cô trao cho bé (Góc Thành tích).';

insert into public.achievement_badges (code, name, emoji, description, tone, sort_order)
values
  ('cay_but_vang', 'Cây bút vàng', '✍️', 'Chữ viết đẹp, nắn nót, đúng mẫu', 'amber', 10),
  ('sieu_nhan_tinh_nham', 'Siêu nhân tính nhẩm', '🧮', 'Tính nhẩm nhanh và chính xác', 'sky', 20),
  ('be_ngoan_chuyen_can', 'Bé ngoan chuyên cần', '🌟', 'Đi học đều, đúng giờ, ngoan ngoãn', 'emerald', 30),
  ('doc_to_ro_rang', 'Giọng đọc truyền cảm', '📖', 'Đọc to, rõ ràng, tự tin', 'violet', 40),
  ('ban_tot_cua_lop', 'Bạn tốt của lớp', '🤝', 'Biết giúp đỡ, chia sẻ với các bạn', 'rose', 50),
  ('nha_tu_duy_nho', 'Nhà tư duy nhí', '🧠', 'Giải được bài khó, suy nghĩ sáng tạo', 'orange', 60),
  ('tap_trung_cao_do', 'Tập trung cao độ', '🎯', 'Chú ý nghe giảng cả buổi', 'sky', 70),
  ('tien_bo_vuot_bac', 'Tiến bộ vượt bậc', '🚀', 'Tiến bộ rõ rệt so với tuần trước', 'emerald', 80)
on conflict (code) do nothing;

alter table public.achievement_badges enable row level security;
revoke all on public.achievement_badges from anon;
grant select, insert, update on public.achievement_badges to authenticated;
drop policy if exists "achievement_badges_select" on public.achievement_badges;
create policy "achievement_badges_select" on public.achievement_badges
  for select to authenticated using (true);
drop policy if exists "achievement_badges_admin_insert" on public.achievement_badges;
create policy "achievement_badges_admin_insert" on public.achievement_badges
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "achievement_badges_admin_update" on public.achievement_badges;
create policy "achievement_badges_admin_update" on public.achievement_badges
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- B. Sao sau mỗi buổi học
-- -----------------------------------------------------------------------------
create table if not exists public.student_star_awards (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  award_date   date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  stars        smallint not null,
  note         text,
  awarded_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint student_star_awards_one_per_day unique (student_id, award_date),
  constraint student_star_awards_stars_range check (stars between 1 and 3),
  constraint student_star_awards_note_len check (note is null or length(note) <= 200)
);
create index if not exists student_star_awards_student_date_idx on public.student_star_awards (student_id, award_date desc);
comment on table public.student_star_awards is 'Sao (1–3) cô tặng bé sau mỗi buổi học — 1 dòng / bé / ngày.';

-- -----------------------------------------------------------------------------
-- C. Huy hiệu đã trao
-- -----------------------------------------------------------------------------
create table if not exists public.student_badge_awards (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  badge_id     uuid not null references public.achievement_badges (id) on delete restrict,
  award_date   date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  note         text,
  awarded_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint student_badge_awards_once_per_day unique (student_id, badge_id, award_date),
  constraint student_badge_awards_note_len check (note is null or length(note) <= 200)
);
create index if not exists student_badge_awards_student_date_idx on public.student_badge_awards (student_id, award_date desc);
create index if not exists student_badge_awards_badge_idx on public.student_badge_awards (badge_id);
comment on table public.student_badge_awards is 'Huy hiệu vinh danh cô trao cho bé — mỗi huy hiệu tối đa 1 lần / bé / ngày.';

-- Người trao = người đang đăng nhập (không cho ghi hộ người khác)
create or replace function public.achievement_award_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.awarded_by := coalesce((select auth.uid()), new.awarded_by);
  if tg_table_name = 'student_star_awards' and tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists achievement_award_stamp on public.student_star_awards;
create trigger achievement_award_stamp before insert or update on public.student_star_awards
  for each row execute function public.achievement_award_stamp();
drop trigger if exists achievement_award_stamp on public.student_badge_awards;
create trigger achievement_award_stamp before insert or update on public.student_badge_awards
  for each row execute function public.achievement_award_stamp();

-- Giáo viên phụ trách: chỉ trong 7 ngày gần nhất, không ghi ngày tương lai
create or replace function public.can_award_student(p_student_id uuid, p_date date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select public.is_admin())
    or (
      public.teacher_can_access_student(p_student_id)
      and p_date between ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7) and ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
    );
$$;
revoke execute on function public.can_award_student(uuid, date) from public, anon;
grant execute on function public.can_award_student(uuid, date) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['student_star_awards', 'student_badge_awards']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format(
      'create policy "%s_select" on public.%I for select to authenticated using (
         public.is_parent_of(student_id) or public.teacher_can_access_student(student_id) or (select public.is_admin()))',
      t, t);
    execute format('drop policy if exists "%s_staff_insert" on public.%I', t, t);
    execute format(
      'create policy "%s_staff_insert" on public.%I for insert to authenticated with check (public.can_award_student(student_id, award_date))',
      t, t);
    execute format('drop policy if exists "%s_staff_update" on public.%I', t, t);
    execute format(
      'create policy "%s_staff_update" on public.%I for update to authenticated
         using (public.can_award_student(student_id, award_date)) with check (public.can_award_student(student_id, award_date))',
      t, t);
    execute format('drop policy if exists "%s_staff_delete" on public.%I', t, t);
    execute format(
      'create policy "%s_staff_delete" on public.%I for delete to authenticated using (public.can_award_student(student_id, award_date))',
      t, t);
  end loop;
end $$;

-- Chỉ trao huy hiệu đang dùng (huy hiệu đã ẩn vẫn còn trong bộ sưu tập cũ)
drop policy if exists "student_badge_awards_active_badge" on public.student_badge_awards;
create policy "student_badge_awards_active_badge" on public.student_badge_awards
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.achievement_badges b where b.id = badge_id and b.active));

-- -----------------------------------------------------------------------------
-- D. Mốc quà khích lệ & việc trao quà
-- -----------------------------------------------------------------------------
create table if not exists public.reward_milestones (
  id              uuid primary key default gen_random_uuid(),
  stars_required  integer not null unique,
  title           text not null,
  emoji           text not null default '🎁',
  description     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint reward_milestones_stars_range check (stars_required between 1 and 10000),
  constraint reward_milestones_text_len check (
    length(title) between 2 and 60 and length(emoji) between 1 and 16 and (description is null or length(description) <= 160)
  )
);
comment on table public.reward_milestones is 'Mốc quà khích lệ theo tổng sao tích luỹ của bé.';

insert into public.reward_milestones (stars_required, title, emoji, description)
values
  (15, 'Bộ sticker TH EDU', '🌈', 'Bộ hình dán ngộ nghĩnh dán vở'),
  (40, 'Hộp bút chì màu', '🖍️', 'Hộp bút màu 12 màu xinh xắn'),
  (80, 'Sách tô màu & truyện tranh', '📚', 'Chọn 1 cuốn bé thích tại quầy'),
  (150, 'Giấy khen + Quà bí mật', '🏆', 'Trao tại lớp, cả lớp cùng chúc mừng')
on conflict (stars_required) do nothing;

alter table public.reward_milestones enable row level security;
revoke all on public.reward_milestones from anon;
grant select, insert, update on public.reward_milestones to authenticated;
drop policy if exists "reward_milestones_select" on public.reward_milestones;
create policy "reward_milestones_select" on public.reward_milestones
  for select to authenticated using (true);
drop policy if exists "reward_milestones_admin_insert" on public.reward_milestones;
create policy "reward_milestones_admin_insert" on public.reward_milestones
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "reward_milestones_admin_update" on public.reward_milestones;
create policy "reward_milestones_admin_update" on public.reward_milestones
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.reward_redemptions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  milestone_id  uuid not null references public.reward_milestones (id) on delete restrict,
  given_at      timestamptz not null default now(),
  given_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  constraint reward_redemptions_once unique (student_id, milestone_id)
);
create index if not exists reward_redemptions_milestone_idx on public.reward_redemptions (milestone_id);
comment on table public.reward_redemptions is 'Cô đã trao quà của mốc nào cho bé.';

alter table public.reward_redemptions enable row level security;
revoke all on public.reward_redemptions from anon;
grant select, insert, delete on public.reward_redemptions to authenticated;
drop policy if exists "reward_redemptions_select" on public.reward_redemptions;
create policy "reward_redemptions_select" on public.reward_redemptions
  for select to authenticated
  using (public.is_parent_of(student_id) or public.teacher_can_access_student(student_id) or (select public.is_admin()));
drop policy if exists "reward_redemptions_staff_insert" on public.reward_redemptions;
create policy "reward_redemptions_staff_insert" on public.reward_redemptions
  for insert to authenticated
  with check ((public.teacher_can_access_student(student_id) or (select public.is_admin())) and given_by = (select auth.uid()));
drop policy if exists "reward_redemptions_staff_delete" on public.reward_redemptions;
create policy "reward_redemptions_staff_delete" on public.reward_redemptions
  for delete to authenticated
  using (public.teacher_can_access_student(student_id) or (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- E. Tổng sao & bảng vàng của lớp
-- -----------------------------------------------------------------------------

-- Tổng sao tích luỹ (sao buổi học + sao bài tập đã chấm). SECURITY INVOKER → RLS của người gọi quyết định bé nào được tính.
create or replace function public.student_star_totals(p_student_ids uuid[])
returns table (student_id uuid, session_stars bigint, homework_stars bigint, total_stars bigint)
language sql stable security invoker set search_path = ''
as $$
  with ids as (select distinct unnest(p_student_ids) as id),
  s as (
    select a.student_id, sum(a.stars)::bigint as n from public.student_star_awards a
    where a.student_id in (select id from ids) group by a.student_id
  ),
  h as (
    select hs.student_id, sum(hs.stars)::bigint as n from public.homework_submissions hs
    where hs.student_id in (select id from ids) and hs.status = 'graded' and hs.stars is not null group by hs.student_id
  )
  select ids.id, coalesce(s.n, 0), coalesce(h.n, 0), coalesce(s.n, 0) + coalesce(h.n, 0)
  from ids left join s on s.student_id = ids.id left join h on h.student_id = ids.id;
$$;
revoke execute on function public.student_star_totals(uuid[]) from public, anon;
grant execute on function public.student_star_totals(uuid[]) to authenticated;

-- Bảng vàng thi đua của lớp trong khoảng ngày: sao buổi học + sao bài tập + số huy hiệu.
-- Phụ huynh trong lớp chỉ thấy TÊN GỌI các bạn (không id, không ảnh); giáo viên phụ trách / quản trị thấy họ tên + id.
create or replace function public.class_achievement_leaderboard(p_campus public.campus, p_class text, p_from date, p_to date)
returns table (student_id uuid, display_name text, stars bigint, badges bigint, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_staff  boolean := (select public.is_admin()) or public.teacher_manages(p_campus, p_class);
  v_parent boolean := exists (
    select 1 from public.students s
    where s.parent_id = v_uid and s.campus = p_campus and s.class_name = p_class
  );
begin
  if not (v_staff or v_parent) or p_to < p_from or p_to - p_from > 62 then
    return;
  end if;

  return query
    with roster as (
      select st.id, st.full_name, st.parent_id from public.students st
      where st.campus = p_campus and st.class_name = p_class
    ),
    ss as (
      select a.student_id, sum(a.stars)::bigint as n from public.student_star_awards a
      where a.student_id in (select id from roster) and a.award_date between p_from and p_to group by a.student_id
    ),
    hw as (
      select hs.student_id, sum(hs.stars)::bigint as n from public.homework_submissions hs
      where hs.student_id in (select id from roster) and hs.status = 'graded' and hs.stars is not null
        and (hs.graded_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      group by hs.student_id
    ),
    bd as (
      select b.student_id, count(*)::bigint as n from public.student_badge_awards b
      where b.student_id in (select id from roster) and b.award_date between p_from and p_to group by b.student_id
    )
    select
      case when v_staff or r.parent_id = v_uid then r.id end,
      case when v_staff then r.full_name else public.given_name(r.full_name) end,
      coalesce(ss.n, 0) + coalesce(hw.n, 0),
      coalesce(bd.n, 0),
      r.parent_id is not distinct from v_uid
    from roster r
    left join ss on ss.student_id = r.id
    left join hw on hw.student_id = r.id
    left join bd on bd.student_id = r.id
    order by 3 desc, 4 desc, 2;
end;
$$;
revoke execute on function public.class_achievement_leaderboard(public.campus, text, date, date) from public, anon;
grant execute on function public.class_achievement_leaderboard(public.campus, text, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- F. Thông báo cho phụ huynh — gộp 1 thông báo / bé / ngày, cập nhật theo lần trao cuối
-- -----------------------------------------------------------------------------
create or replace function public.achievement_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_student uuid;
  v_date    date;
  v_parent  uuid;
  v_name    text;
  v_stars   smallint;
  v_badges  text;
  v_first   text;
  v_note    text;
  v_title   text;
  v_body    text;
  v_new_badge boolean := tg_table_name = 'student_badge_awards' and tg_op = 'INSERT';
begin
  if tg_op = 'DELETE' then
    v_student := old.student_id;
    v_date := old.award_date;
  else
    v_student := new.student_id;
    v_date := new.award_date;
  end if;
  begin
    select s.parent_id, public.given_name(s.full_name) into v_parent, v_name from public.students s where s.id = v_student;
    if v_parent is null then
      return null;
    end if;

    select a.stars, nullif(trim(a.note), '') into v_stars, v_note
    from public.student_star_awards a where a.student_id = v_student and a.award_date = v_date;
    select string_agg(b.emoji || ' ' || b.name, ' · ' order by ba.created_at), (array_agg(b.name order by ba.created_at desc))[1]
      into v_badges, v_first
    from public.student_badge_awards ba join public.achievement_badges b on b.id = ba.badge_id
    where ba.student_id = v_student and ba.award_date = v_date;

    -- Cô gỡ hết sao & huy hiệu của ngày đó → gỡ luôn thông báo
    if v_stars is null and v_badges is null then
      delete from public.notifications n
      where n.recipient_id = v_parent and n.student_id = v_student and n.type = 'achievement'::text::public.notification_type
        and n.ref_date = v_date and n.ref_id is null;
      return null;
    end if;

    v_title := case
      when v_badges is not null then '🏅 Bé ' || coalesce(v_name, '') || ' nhận huy hiệu “' || v_first || '”!'
      else '⭐ Bé ' || coalesce(v_name, '') || ' được cô tặng ' || v_stars || ' sao'
    end;
    v_body := concat_ws(' · ',
      case when v_stars is not null then repeat('⭐', v_stars) || ' ' || v_stars || ' sao buổi học' end,
      v_badges,
      v_note
    );

    insert into public.notifications (recipient_id, student_id, type, ref_date, ref_id, title, body)
    values (v_parent, v_student, 'achievement'::text::public.notification_type, v_date, null, v_title, left(v_body, 500))
    on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
      set title = excluded.title,
          body = excluded.body,
          -- Huy hiệu mới → hiện lại "chưa đọc" + đẩy lại; đổi số sao → chỉ sửa nội dung (không làm phiền)
          read_at = case when v_new_badge then null else public.notifications.read_at end,
          created_at = case when v_new_badge then now() else public.notifications.created_at end,
          pushed_at = case when v_new_badge then null else public.notifications.pushed_at end;
  exception when others then raise warning 'achievement_notify: %', sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists achievement_notify on public.student_star_awards;
create trigger achievement_notify after insert or update or delete on public.student_star_awards
  for each row execute function public.achievement_notify();
drop trigger if exists achievement_notify on public.student_badge_awards;
create trigger achievement_notify after insert or delete on public.student_badge_awards
  for each row execute function public.achievement_notify();
revoke execute on function public.achievement_notify() from public, anon, authenticated;

-- Nhật ký thay đổi (apply-security-audit.sql)
do $$
declare
  t text;
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    foreach t in array array['student_star_awards', 'student_badge_awards', 'reward_redemptions', 'achievement_badges', 'reward_milestones']
    loop
      execute format('drop trigger if exists audit_row_change on public.%I', t);
      execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
    end loop;
  end if;
end $$;

commit;
