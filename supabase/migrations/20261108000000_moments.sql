-- =============================================================================
-- "Góc Khoảnh Khắc": album ảnh / video hoạt động lớp như mạng xã hội nội bộ thu nhỏ.
--   - Giáo viên đăng chuỗi ảnh/video cho CẢ LỚP hoặc NHÓM NHỎ (chỉ phụ huynh các bé được gắn thẻ thấy).
--   - Gắn thẻ học sinh trên từng ảnh → phụ huynh lọc "Ảnh có bé nhà mình", tải ảnh gốc.
--   - Thả tim / like, bình luận (tên hiển thị ẩn danh hoá: "Bố/mẹ bé An" — không lộ họ tên, SĐT phụ huynh khác).
--   - Thông báo: bài mới (riêng cho bé được gắn thẻ), bình luận mới → giáo viên + phụ huynh liên quan.
-- QUYỀN RIÊNG TƯ: mọi quyền xem (bài, ảnh trong kho, cảm xúc, bình luận) đi qua 1 hàm duy nhất can_view_moment().
-- Chạy lại nhiều lần vẫn an toàn. Enum mới chỉ dùng qua ép kiểu text (SQL Editor chạy 1 giao dịch).
-- =============================================================================

alter type public.notification_type add value if not exists 'moment_posted';
alter type public.notification_type add value if not exists 'moment_comment';

create table if not exists public.moments (
  id           uuid primary key default gen_random_uuid(),
  campus       public.campus not null,
  class_name   text not null,
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text not null default '',
  category     text not null default 'class',
  visibility   text not null default 'class',
  caption      text not null default '',
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint moments_class_fkey foreign key (campus, class_name) references public.classes (campus, name) on update cascade on delete cascade,
  constraint moments_category_valid check (category in ('class', 'toan_tu_duy', 'luyen_chu', 'tien_tieu_hoc', 'ngoai_khoa')),
  constraint moments_visibility_valid check (visibility in ('class', 'tagged')),
  constraint moments_caption_length check (length(caption) <= 2000)
);
create index if not exists moments_class_idx on public.moments (campus, class_name, published_at desc) where published;

create table if not exists public.moment_media (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid not null references public.moments (id) on delete cascade,
  path        text not null,
  kind        text not null default 'image',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint moment_media_kind check (kind in ('image', 'video')),
  constraint moment_media_path check (path like moment_id::text || '/%')
);
create index if not exists moment_media_moment_idx on public.moment_media (moment_id, position);

create table if not exists public.moment_media_tags (
  media_id    uuid not null references public.moment_media (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  primary key (media_id, student_id)
);
create index if not exists moment_media_tags_student_idx on public.moment_media_tags (student_id);

create table if not exists public.moment_reactions (
  moment_id   uuid not null references public.moments (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (moment_id, user_id, kind),
  constraint moment_reactions_kind check (kind in ('heart', 'like'))
);

create table if not exists public.moment_comments (
  id            uuid primary key default gen_random_uuid(),
  moment_id     uuid not null references public.moments (id) on delete cascade,
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_label  text not null default '',
  author_role   text not null default 'parent',
  body          text not null,
  created_at    timestamptz not null default now(),
  constraint moment_comments_body check (length(trim(body)) between 1 and 500)
);
create index if not exists moment_comments_moment_idx on public.moment_comments (moment_id, created_at);

drop trigger if exists moments_touch on public.moments;
create trigger moments_touch before update on public.moments for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Quyền xem — DUY NHẤT một chỗ
-- -----------------------------------------------------------------------------
create or replace function public.can_view_moment(p_moment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment
      and (
        (select public.is_admin())
        or public.teacher_manages(m.campus, m.class_name)
        or (
          m.published
          and exists (
            select 1 from public.students s
            where s.parent_id = (select auth.uid()) and s.campus = m.campus and s.class_name = m.class_name
              and (
                m.visibility = 'class'
                or exists (
                  select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id
                  where mm.moment_id = m.id and t.student_id = s.id
                )
              )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_moment(p_moment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment and ((select public.is_admin()) or public.teacher_manages(m.campus, m.class_name))
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.moments enable row level security;
alter table public.moment_media enable row level security;
alter table public.moment_media_tags enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_comments enable row level security;
revoke all on public.moments, public.moment_media, public.moment_media_tags, public.moment_reactions, public.moment_comments from anon;

drop policy if exists "moments_select" on public.moments;
create policy "moments_select" on public.moments for select to authenticated using (public.can_view_moment(id));
drop policy if exists "moments_insert" on public.moments;
create policy "moments_insert" on public.moments for insert to authenticated
  with check (((select public.is_admin()) or public.teacher_manages(campus, class_name)) and author_id = (select auth.uid()));
drop policy if exists "moments_update" on public.moments;
create policy "moments_update" on public.moments for update to authenticated
  using ((select public.is_admin()) or public.teacher_manages(campus, class_name))
  with check ((select public.is_admin()) or public.teacher_manages(campus, class_name));
drop policy if exists "moments_delete" on public.moments;
create policy "moments_delete" on public.moments for delete to authenticated
  using ((select public.is_admin()) or public.teacher_manages(campus, class_name));

drop policy if exists "moment_media_select" on public.moment_media;
create policy "moment_media_select" on public.moment_media for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_media_write" on public.moment_media;
create policy "moment_media_write" on public.moment_media for all to authenticated
  using (public.can_manage_moment(moment_id)) with check (public.can_manage_moment(moment_id));

drop policy if exists "moment_media_tags_select" on public.moment_media_tags;
create policy "moment_media_tags_select" on public.moment_media_tags for select to authenticated
  using (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_view_moment(mm.moment_id)));
drop policy if exists "moment_media_tags_write" on public.moment_media_tags;
create policy "moment_media_tags_write" on public.moment_media_tags for all to authenticated
  using (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_manage_moment(mm.moment_id)))
  with check (exists (select 1 from public.moment_media mm where mm.id = media_id and public.can_manage_moment(mm.moment_id)));

drop policy if exists "moment_reactions_select" on public.moment_reactions;
create policy "moment_reactions_select" on public.moment_reactions for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_reactions_insert" on public.moment_reactions;
create policy "moment_reactions_insert" on public.moment_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_moment(moment_id));
drop policy if exists "moment_reactions_delete" on public.moment_reactions;
create policy "moment_reactions_delete" on public.moment_reactions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "moment_comments_select" on public.moment_comments;
create policy "moment_comments_select" on public.moment_comments for select to authenticated using (public.can_view_moment(moment_id));
drop policy if exists "moment_comments_insert" on public.moment_comments;
create policy "moment_comments_insert" on public.moment_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_moment(moment_id));
drop policy if exists "moment_comments_delete" on public.moment_comments;
create policy "moment_comments_delete" on public.moment_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_moment(moment_id));

-- Tên hiển thị khi bình luận: giáo viên = họ tên; phụ huynh = "Bố/mẹ bé <tên gọi>" (con học lớp đó) — không lộ danh tính
create or replace function public.moment_comment_label()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role  text;
  v_name  text;
  v_child text;
begin
  select p.role::text, p.full_name into v_role, v_name from public.profiles p where p.id = new.author_id;
  if v_role = 'parent' then
    select string_agg(public.given_name(s.full_name), ', ' order by s.full_name) into v_child
    from public.students s join public.moments m on m.id = new.moment_id
    where s.parent_id = new.author_id and s.campus = m.campus and s.class_name = m.class_name;
    new.author_label := 'Bố/mẹ bé ' || coalesce(v_child, '');
    new.author_role := 'parent';
  else
    new.author_label := coalesce(nullif(v_name, ''), case when v_role = 'admin' then 'Trung tâm TH EDU' else 'Giáo viên' end);
    new.author_role := coalesce(v_role, 'teacher');
  end if;
  return new;
end;
$$;
drop trigger if exists moment_comment_label on public.moment_comments;
create trigger moment_comment_label before insert on public.moment_comments
  for each row execute function public.moment_comment_label();

-- -----------------------------------------------------------------------------
-- Kho ảnh PRIVATE `moments`: {moment_id}/{file} — quyền đọc = quyền xem bài
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 104857600, array['image/*', 'video/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "moments_read" on storage.objects;
create policy "moments_read" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and public.can_view_moment(public.safe_uuid((storage.foldername(name))[1])));
drop policy if exists "moments_insert" on storage.objects;
create policy "moments_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and public.can_manage_moment(public.safe_uuid((storage.foldername(name))[1])));
drop policy if exists "moments_delete" on storage.objects;
create policy "moments_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and public.can_manage_moment(public.safe_uuid((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- Thông báo
-- -----------------------------------------------------------------------------
-- Đăng bài (published false → true): phụ huynh trong lớp (hoặc chỉ phụ huynh bé được gắn thẻ); bé có trong ảnh → báo riêng
create or replace function public.moment_published_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_count integer;
begin
  if not new.published or (tg_op = 'UPDATE' and old.published) then
    return new;
  end if;
  select count(*) into v_count from public.moment_media where moment_id = new.id;
  for r in
    select distinct on (s.parent_id) s.id as student_id, public.given_name(s.full_name) as name,
           exists (select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id
                   where mm.moment_id = new.id and t.student_id = s.id) as tagged
    from public.students s
    where s.campus = new.campus and s.class_name = new.class_name and s.parent_id is not null
    order by s.parent_id, 3 desc
  loop
    continue when new.visibility = 'tagged' and not r.tagged;
    perform public.notify_parent_ref(
      r.student_id, 'moment_posted'::text::public.notification_type, (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.id,
      case when r.tagged then format('📸 Bé %s xuất hiện trong khoảnh khắc mới của lớp %s', r.name, new.class_name)
           else format('📸 Lớp %s có khoảnh khắc mới', new.class_name) end,
      coalesce(nullif(left(trim(new.caption), 120), ''), format('%s ảnh / video mới từ %s', v_count, coalesce(nullif(new.author_name, ''), 'cô giáo')))
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists moment_published_notify on public.moments;
create trigger moment_published_notify after insert or update of published on public.moments
  for each row execute function public.moment_published_notify();

-- Bình luận mới → giáo viên đăng bài + phụ huynh các bé được gắn thẻ + những người đã bình luận (trừ người viết)
create or replace function public.moment_comment_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_moment  record;
  v_student uuid;
  r         record;
  v_title   text;
  v_body    text;
begin
  select * into v_moment from public.moments where id = new.moment_id;
  if not found or not v_moment.published then
    return new;
  end if;
  v_title := format('💬 %s bình luận khoảnh khắc lớp %s', new.author_label, v_moment.class_name);
  v_body := left(trim(new.body), 140);

  -- Giáo viên đăng bài (thông báo gắn với 1 học sinh trong lớp để hiện đúng trang)
  if v_moment.author_id is not null and v_moment.author_id <> new.author_id then
    select s.id into v_student from public.students s where s.campus = v_moment.campus and s.class_name = v_moment.class_name limit 1;
    if v_student is not null then
      insert into public.notifications as n (recipient_id, student_id, type, ref_date, ref_id, title, body)
      values (v_moment.author_id, v_student, 'moment_comment'::text::public.notification_type, (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.moment_id, v_title, v_body)
      on conflict (recipient_id, student_id, type, ref_date, ref_id) do update
        set title = excluded.title, body = excluded.body, read_at = null, pushed_at = null, created_at = now();
    end if;
  end if;

  -- Phụ huynh liên quan
  for r in
    select distinct on (s.parent_id) s.id as student_id
    from public.students s
    where s.campus = v_moment.campus and s.class_name = v_moment.class_name and s.parent_id is not null and s.parent_id <> new.author_id
      and (
        exists (select 1 from public.moment_media mm join public.moment_media_tags t on t.media_id = mm.id where mm.moment_id = new.moment_id and t.student_id = s.id)
        or exists (select 1 from public.moment_comments c where c.moment_id = new.moment_id and c.author_id = s.parent_id and c.id <> new.id)
      )
    order by s.parent_id
  loop
    perform public.notify_parent_ref(r.student_id, 'moment_comment'::text::public.notification_type,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.moment_id, v_title, v_body);
  end loop;
  return new;
end;
$$;
drop trigger if exists moment_comment_notify on public.moment_comments;
create trigger moment_comment_notify after insert on public.moment_comments
  for each row execute function public.moment_comment_notify();

-- Realtime: bảng tin khoảnh khắc cập nhật ngay
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['moments', 'moment_comments', 'moment_reactions'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Tên gọi các bé được gắn thẻ (chỉ tên gọi, chỉ bài người xem được phép xem) — phụ huynh không đọc được hồ sơ bé khác
create or replace function public.moment_tag_names(p_moment_ids uuid[])
returns table (moment_id uuid, media_id uuid, student_id uuid, given_name text)
language sql stable security definer set search_path = ''
as $$
  select mm.moment_id, t.media_id, t.student_id, public.given_name(s.full_name)
  from public.moment_media mm
  join public.moment_media_tags t on t.media_id = mm.id
  join public.students s on s.id = t.student_id
  where mm.moment_id = any (p_moment_ids) and public.can_view_moment(mm.moment_id);
$$;
revoke execute on function public.moment_tag_names(uuid[]) from public, anon;
grant execute on function public.moment_tag_names(uuid[]) to authenticated;

-- Xoá bài → gỡ thông báo về bài đó (của mọi người nhận)
create or replace function public.moment_deleted_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n where n.ref_id = old.id and n.type::text in ('moment_posted', 'moment_comment');
  return old;
end;
$$;
drop trigger if exists moment_deleted_cleanup on public.moments;
create trigger moment_deleted_cleanup after delete on public.moments
  for each row execute function public.moment_deleted_cleanup();
