-- =============================================================================
-- Ca học: quản trị viên tạo ca (giờ bắt đầu/kết thúc + các ngày trong tuần) và gán cho lớp.
-- Chỉ quản trị viên được tạo / sửa / xoá; mọi người đã đăng nhập được xem.
-- Lớp chưa gán ca → dùng lịch mặc định của ứng dụng (Thứ 2 – Thứ 7, 18:00 – 19:30).
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create table if not exists public.class_shifts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  -- Ngày học theo ISO: 1 = Thứ 2 … 6 = Thứ 7, 7 = Chủ nhật
  weekdays    smallint[] not null default '{1,2,3,4,5,6}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint class_shifts_name_unique unique (name),
  constraint class_shifts_name_length check (length(trim(name)) between 1 and 60),
  constraint class_shifts_time_order check (end_time > start_time),
  constraint class_shifts_weekdays_valid check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);
comment on table public.class_shifts is 'Ca học (giờ + ngày trong tuần) do quản trị viên tạo, gán cho lớp qua classes.shift_id.';

alter table public.classes
  add column if not exists shift_id uuid references public.class_shifts (id) on delete set null;
create index if not exists classes_shift_idx on public.classes (shift_id);

alter table public.class_shifts enable row level security;
revoke all on public.class_shifts from anon;

drop policy if exists "admin_all_class_shifts" on public.class_shifts;
create policy "admin_all_class_shifts" on public.class_shifts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Giáo viên / phụ huynh chỉ XEM (lịch học của lớp); không có policy ghi → không tạo/sửa được
drop policy if exists "class_shifts_select_authenticated" on public.class_shifts;
create policy "class_shifts_select_authenticated" on public.class_shifts
  for select to authenticated
  using (true);
