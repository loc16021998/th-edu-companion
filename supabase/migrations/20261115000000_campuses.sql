-- =============================================================================
-- Bản đồ cơ sở & đơn xin chuyển cơ sở.
--
--  A. campus_profiles: địa chỉ, toạ độ, link Google Maps, hotline, ảnh mặt tiền, giờ mở cửa của từng cơ sở.
--     Mọi người đã đăng nhập ĐỌC được (phụ huynh xem bản đồ / chỉ đường); chỉ quản trị viên sửa
--     (Admin → Cơ sở & bản đồ: dán link Google Maps → tự lấy toạ độ chính xác).
--     Dữ liệu khởi tạo: toạ độ GẦN ĐÚNG (location_verified = false) → app chỉ đường theo ĐỊA CHỈ cho tới khi được xác minh.
--  B. campus_photos: bucket công khai cho ảnh mặt tiền (không chứa dữ liệu cá nhân).
--  C. campus_transfer_requests: phụ huynh xin chuyển bé sang cơ sở khác (kèm khoảng cách từ nhà tới 2 cơ sở nếu cho phép
--     định vị); quản trị viên duyệt + xếp lớp mới → phụ huynh nhận thông báo.
--
-- Chạy lại nhiều lần vẫn an toàn. Giá trị enum mới thêm ngoài giao dịch.
-- =============================================================================

alter type public.notification_type add value if not exists 'campus_transfer';

begin;

-- -----------------------------------------------------------------------------
-- A. Hồ sơ cơ sở
-- -----------------------------------------------------------------------------
create table if not exists public.campus_profiles (
  campus             public.campus primary key,
  name               text not null,
  address            text not null,
  lat                double precision not null,
  lng                double precision not null,
  location_verified  boolean not null default false,
  google_maps_url    text,
  contacts           jsonb not null default '[]'::jsonb,
  opening_hours      text not null default 'Sáng 8:00 – 11:30 · Chiều 14:00 – 20:30',
  photo_url          text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id) on delete set null,
  constraint campus_profiles_lat_range check (lat between -90 and 90),
  constraint campus_profiles_lng_range check (lng between -180 and 180),
  constraint campus_profiles_contacts_array check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 6),
  constraint campus_profiles_text_len check (length(name) <= 80 and length(address) <= 300 and length(opening_hours) <= 120),
  constraint campus_profiles_url_https check (
    (google_maps_url is null or google_maps_url ~ '^https://') and (photo_url is null or photo_url ~ '^https://')
  )
);
comment on table public.campus_profiles is 'Địa chỉ, toạ độ, hotline, ảnh mặt tiền từng cơ sở — cho bản đồ & chỉ đường.';

-- Toạ độ khởi tạo GẦN ĐÚNG theo khu vực (OpenStreetMap) — quản trị viên dán link Google Maps để xác minh
insert into public.campus_profiles (campus, name, address, lat, lng, contacts)
values
  ('CS1_XALA', 'CS1 Xa La', 'Số 26 LK2, Khu đô thị Xa La, Hà Đông, Hà Nội', 20.9640, 105.7905,
   '[{"name": "Cô Hường", "phone": "+84978951289"}]'::jsonb),
  ('CS2_NGOTHINHAM', 'CS2 Ngô Thì Nhậm', 'LK 24 ô 48 Ngô Thì Nhậm, Hà Đông, Hà Nội', 20.9585, 105.7790,
   '[{"name": "Thầy Tú", "phone": "+84982194144"}]'::jsonb)
on conflict (campus) do nothing;

-- Địa chỉ CS2 chính thức (đã chạy bản cũ của file này → cập nhật, trừ khi quản trị viên đã tự sửa địa chỉ khác)
update public.campus_profiles
set address = 'LK 24 ô 48 Ngô Thì Nhậm, Hà Đông, Hà Nội'
where campus = 'CS2_NGOTHINHAM' and address = 'Khu đô thị Ngô Thì Nhậm, Hà Đông, Hà Nội';

drop trigger if exists campus_profiles_touch on public.campus_profiles;
create trigger campus_profiles_touch before update on public.campus_profiles
  for each row execute function public.touch_updated_at();

alter table public.campus_profiles enable row level security;
revoke all on public.campus_profiles from anon;
grant select, update on public.campus_profiles to authenticated;
drop policy if exists "campus_profiles_select" on public.campus_profiles;
create policy "campus_profiles_select" on public.campus_profiles
  for select to authenticated using (true);
drop policy if exists "campus_profiles_admin_update" on public.campus_profiles;
create policy "campus_profiles_admin_update" on public.campus_profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- B. Ảnh mặt tiền (bucket công khai — ảnh toà nhà, không có trẻ em)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-photos', 'campus-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_photos_admin_write" on storage.objects;
create policy "campus_photos_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campus-photos' and (select public.is_admin()));
drop policy if exists "campus_photos_admin_update" on storage.objects;
create policy "campus_photos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'campus-photos' and (select public.is_admin()));
drop policy if exists "campus_photos_admin_delete" on storage.objects;
create policy "campus_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'campus-photos' and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- C. Đơn xin chuyển cơ sở
-- -----------------------------------------------------------------------------
create table if not exists public.campus_transfer_requests (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  from_campus      public.campus not null,
  to_campus        public.campus not null,
  reason           text,
  distance_from_km numeric(6, 1),
  distance_to_km   numeric(6, 1),
  status           text not null default 'pending',
  admin_note       text,
  new_class_name   text,
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  constraint campus_transfer_different check (from_campus <> to_campus),
  constraint campus_transfer_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint campus_transfer_text_len check ((reason is null or length(reason) <= 500) and (admin_note is null or length(admin_note) <= 500)),
  constraint campus_transfer_distance_range check (
    (distance_from_km is null or distance_from_km between 0 and 500) and (distance_to_km is null or distance_to_km between 0 and 500)
  )
);
create index if not exists campus_transfer_student_idx on public.campus_transfer_requests (student_id, created_at desc);
create index if not exists campus_transfer_pending_idx on public.campus_transfer_requests (created_at) where status = 'pending';
-- Mỗi bé chỉ 1 đơn đang chờ
create unique index if not exists campus_transfer_one_pending on public.campus_transfer_requests (student_id) where status = 'pending';

alter table public.campus_transfer_requests enable row level security;
revoke all on public.campus_transfer_requests from anon;
grant select, insert, update on public.campus_transfer_requests to authenticated;

drop policy if exists "campus_transfer_admin_all" on public.campus_transfer_requests;
create policy "campus_transfer_admin_all" on public.campus_transfer_requests
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "campus_transfer_parent_select" on public.campus_transfer_requests;
create policy "campus_transfer_parent_select" on public.campus_transfer_requests
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- Phụ huynh gửi đơn cho CON MÌNH, đúng cơ sở hiện tại của bé, chỉ ở trạng thái chờ
drop policy if exists "campus_transfer_parent_insert" on public.campus_transfer_requests;
create policy "campus_transfer_parent_insert" on public.campus_transfer_requests
  for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and public.is_parent_of(student_id)
    and status = 'pending' and admin_note is null and decided_by is null and decided_at is null and new_class_name is null
    and from_campus = (select s.campus from public.students s where s.id = student_id)
  );

-- Phụ huynh chỉ được rút đơn đang chờ (pending → cancelled)
drop policy if exists "campus_transfer_parent_cancel" on public.campus_transfer_requests;
create policy "campus_transfer_parent_cancel" on public.campus_transfer_requests
  for update to authenticated
  using (parent_id = (select auth.uid()) and status = 'pending')
  with check (parent_id = (select auth.uid()) and status = 'cancelled');

-- Đơn mới → bảng tin quản trị; quyết định → thông báo cho phụ huynh
create or replace function public.campus_transfer_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_child text;
  v_to    text := case new.to_campus when 'CS1_XALA' then 'CS1 Xa La' else 'CS2 Ngô Thì Nhậm' end;
begin
  select s.full_name into v_child from public.students s where s.id = new.student_id;
  begin
    if tg_op = 'INSERT' then
      perform public.admin_feed_push(
        'feedback', new.parent_id, null,
        'Xin chuyển cơ sở: bé ' || coalesce(v_child, '') || ' → ' || v_to,
        coalesce(left(new.reason, 140), 'Không ghi lý do')
          || case when new.distance_to_km is not null then ' · nhà cách ' || v_to || ' ' || new.distance_to_km || ' km' else '' end,
        '/admin/campuses'
      );
    elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
      insert into public.notifications (recipient_id, student_id, type, ref_date, ref_id, title, body)
      values (
        new.parent_id, new.student_id, 'campus_transfer'::text::public.notification_type,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date, new.id,
        case when new.status = 'approved' then 'Đã duyệt chuyển bé ' || coalesce(v_child, '') || ' sang ' || v_to
             else 'Đơn chuyển cơ sở của bé ' || coalesce(v_child, '') || ' chưa được duyệt' end,
        coalesce(nullif(trim(new.admin_note), ''),
          case when new.status = 'approved' then 'Lớp mới: ' || coalesce(new.new_class_name, 'trung tâm sẽ báo') else 'Trung tâm sẽ liên hệ anh/chị.' end)
      )
      on conflict do nothing;
    end if;
  exception when others then raise warning 'campus_transfer_notify: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists campus_transfer_notify on public.campus_transfer_requests;
create trigger campus_transfer_notify after insert or update of status on public.campus_transfer_requests
  for each row execute function public.campus_transfer_notify();

-- Nhật ký thay đổi
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.campus_transfer_requests;
    create trigger audit_row_change after insert or update or delete on public.campus_transfer_requests
      for each row execute function public.audit_row_change();
    drop trigger if exists audit_row_change on public.campus_profiles;
    create trigger audit_row_change after insert or update or delete on public.campus_profiles
      for each row execute function public.audit_row_change('updated_at');
  end if;
  -- Xoá đơn → gỡ thông báo trỏ tới đơn (apply-monitoring.sql)
  if to_regprocedure('public.notifications_cleanup_ref()') is not null then
    drop trigger if exists notifications_cleanup_ref on public.campus_transfer_requests;
    create trigger notifications_cleanup_ref after delete on public.campus_transfer_requests
      for each row execute function public.notifications_cleanup_ref();
  end if;
end $$;

-- Báo cáo toàn vẹn (apply-monitoring.sql): thông báo trỏ tới đơn chuyển cơ sở là hợp lệ, không phải "mồ côi"
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
revoke execute on function public.notification_ref_exists(uuid) from public, anon, authenticated;

revoke execute on function public.campus_transfer_notify() from public, anon, authenticated;

commit;
