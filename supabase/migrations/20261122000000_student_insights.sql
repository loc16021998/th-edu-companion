-- =============================================================================
-- Cảnh báo sớm tiến độ học tập (Giáo viên → Cảnh báo sớm, Quản trị → Cảnh báo sớm).
--
-- Cảnh báo được TÍNH TRỰC TIẾP từ điểm danh / sổ liên lạc / bài tập 30 ngày (không lưu) → luôn mới nhất.
-- Bảng này chỉ lưu phần do AI / giáo viên soạn để không phải gọi AI lại mỗi lần mở trang:
--   - intervention: gợi ý can thiệp sư phạm (kèm dấu vân tay các cảnh báo — cảnh báo đổi → gợi ý cũ hết hiệu lực)
--   - report360:    bản nháp "Nhận xét chiều sâu 360°" gửi phụ huynh (giáo viên sửa được)
-- Quyền: giáo viên phụ trách lớp của bé + quản trị. Phụ huynh không đọc được (nội dung nội bộ đến khi giáo viên gửi).
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

create table if not exists public.student_insight_notes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  kind          text not null,
  fingerprint   text not null default '',
  content       text not null,
  ai_generated  boolean not null default false,
  sent_at       timestamptz,
  updated_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint student_insight_notes_unique unique (student_id, kind),
  constraint student_insight_notes_kind check (kind in ('intervention', 'report360')),
  constraint student_insight_notes_content check (length(trim(content)) between 1 and 6000)
);

alter table public.student_insight_notes enable row level security;
revoke all on public.student_insight_notes from anon;
drop policy if exists "student_insight_notes_staff" on public.student_insight_notes;
create policy "student_insight_notes_staff" on public.student_insight_notes
  for all to authenticated
  using ((select public.is_admin()) or public.teacher_can_access_student(student_id))
  with check ((select public.is_admin()) or public.teacher_can_access_student(student_id));

commit;
