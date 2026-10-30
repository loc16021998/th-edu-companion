-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì). Chỉ chạy MỘT lần.
-- Tạo bảng phản hồi của phụ huynh (tab "Phản hồi" và trang quản trị "Phản hồi").
-- =============================================================================
-- Phản hồi của phụ huynh gửi trung tâm (góp ý, thắc mắc) + trả lời của quản trị viên.
-- =============================================================================
begin;

create type public.feedback_status as enum ('new', 'in_progress', 'resolved');

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid references public.students (id) on delete set null,
  category     text not null,
  content      text not null,
  status       public.feedback_status not null default 'new',
  admin_reply  text,
  replied_by   uuid references public.profiles (id) on delete set null,
  replied_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint feedback_category_valid check (category in ('hoc_tap', 'lich_hoc', 'hoc_phi', 'giao_vien', 'co_so_vat_chat', 'khac')),
  constraint feedback_content_length check (length(trim(content)) between 5 and 2000),
  constraint feedback_reply_length check (admin_reply is null or length(admin_reply) <= 2000)
);
comment on table public.feedback is 'Phản hồi phụ huynh gửi trung tâm; quản trị viên trả lời.';

create index feedback_parent_created_idx on public.feedback (parent_id, created_at desc);
create index feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon;

-- Phụ huynh: gửi phản hồi đứng tên mình (về con mình hoặc chung), xem phản hồi của mình.
-- Không sửa/xoá — giữ nguyên lịch sử trao đổi.
create policy "feedback_parent_insert" on public.feedback
  for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and status = 'new'
    and admin_reply is null
    and replied_by is null
    and replied_at is null
    and (student_id is null or public.is_parent_of(student_id))
  );

create policy "feedback_parent_select" on public.feedback
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- Quản trị viên: xem tất cả, trả lời, đổi trạng thái
create policy "admin_all_feedback" on public.feedback
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

commit;
