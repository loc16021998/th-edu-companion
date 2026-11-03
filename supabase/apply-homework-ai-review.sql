-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- AI phân tích bài tập & chữ viết: bản chấm nháp cho cô + lời khen cho bé. Chạy lại vẫn an toàn.
-- =============================================================================
-- AI phân tích bài tập & chữ viết (Bài tập về nhà → phụ huynh nộp ảnh → cô chấm).
--
-- Mỗi bài nộp có 1 bản phân tích (làm lại khi phụ huynh nộp lại ảnh khác — media_key đổi):
--   - Bản chấm NHÁP cho cô: đánh giá từng tiêu chí, nhận xét gợi ý, số sao gợi ý → cô bấm "Chấp nhận nhận xét".
--   - Lời khen cho bé (kid_praise): phụ huynh đọc cho con nghe ngay sau khi nộp.
--
-- Quyền:
--   - Đọc toàn bộ: giáo viên phụ trách lớp của bé + quản trị (bản nháp là nội bộ, cô duyệt rồi mới gửi).
--   - Phụ huynh: CHỈ lấy được lời khen của con mình qua hàm homework_kid_praises() — không đọc được bản chấm nháp.
--   - Ghi: chỉ máy chủ (service_role) sau khi đã kiểm tra quyền — không có chính sách ghi cho người dùng.
-- Cần đã chạy: apply-homework.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

create table if not exists public.homework_ai_reviews (
  submission_id    uuid primary key references public.homework_submissions (id) on delete cascade,
  media_key        text not null,
  status           text not null default 'done',
  subject          text,
  readable         boolean not null default true,
  criteria         jsonb not null default '[]',
  draft_comment    text,
  suggested_stars  smallint,
  kid_praise       text not null,
  ai_generated     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint homework_ai_reviews_status check (status in ('done', 'unavailable', 'failed')),
  constraint homework_ai_reviews_stars check (suggested_stars is null or suggested_stars between 1 and 3),
  constraint homework_ai_reviews_comment check (draft_comment is null or length(draft_comment) <= 1000),
  constraint homework_ai_reviews_praise check (length(trim(kid_praise)) between 1 and 400)
);

alter table public.homework_ai_reviews enable row level security;
revoke all on public.homework_ai_reviews from anon;
drop policy if exists "homework_ai_reviews_staff_read" on public.homework_ai_reviews;
create policy "homework_ai_reviews_staff_read" on public.homework_ai_reviews
  for select to authenticated
  using (exists (
    select 1 from public.homework_submissions s
    where s.id = homework_ai_reviews.submission_id
      and ((select public.is_admin()) or public.teacher_can_access_student(s.student_id))
  ));

-- Phụ huynh: lời khen của con mình (chỉ cột kid_praise)
create or replace function public.homework_kid_praises(p_ids uuid[])
returns table (submission_id uuid, kid_praise text)
language sql stable security definer set search_path = ''
as $$
  select r.submission_id, r.kid_praise
  from public.homework_ai_reviews r
  join public.homework_submissions s on s.id = r.submission_id
  where r.submission_id = any (p_ids)
    and public.is_parent_of(s.student_id);
$$;
revoke execute on function public.homework_kid_praises(uuid[]) from public, anon;
grant execute on function public.homework_kid_praises(uuid[]) to authenticated;

commit;
