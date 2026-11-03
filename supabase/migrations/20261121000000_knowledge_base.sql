-- =============================================================================
-- Kho kiến thức cho Trợ lý AI hỏi – đáp của phụ huynh (Quản trị → Kho kiến thức Trợ lý AI).
--
-- Quản trị soạn quy chế (nghỉ học, học bù, học phí…), lịch & quy định chung, tài liệu sư phạm của TH EDU
-- (cách cầm bút, đồng hành Toán tư duy / Tiền tiểu học tại nhà…). Trợ lý chỉ dùng bài ĐANG BẬT để trả lời —
-- câu hỏi về quy định mà kho chưa có → trợ lý nói chưa có thông tin + mời kết nối Quản lý cơ sở, không tự bịa.
--
-- Đọc: mọi tài khoản đăng nhập (bài đang bật — nội dung công khai với phụ huynh). Sửa: chỉ quản trị.
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

create table if not exists public.knowledge_articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'khac',
  content     text not null,
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint knowledge_articles_title check (length(trim(title)) between 3 and 150),
  constraint knowledge_articles_content check (length(trim(content)) between 10 and 8000),
  constraint knowledge_articles_category check (category in ('quy_che', 'hoc_phi', 'lich_hoc', 'su_pham', 'ung_dung', 'khac'))
);
create index if not exists knowledge_articles_active_idx on public.knowledge_articles (active, category, updated_at desc);

alter table public.knowledge_articles enable row level security;
revoke all on public.knowledge_articles from anon;
drop policy if exists "knowledge_articles_read" on public.knowledge_articles;
create policy "knowledge_articles_read" on public.knowledge_articles
  for select to authenticated using (active or (select public.is_admin()));
drop policy if exists "admin_all_knowledge_articles" on public.knowledge_articles;
create policy "admin_all_knowledge_articles" on public.knowledge_articles
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Nhật ký & bảo mật (nếu đã cài apply-security-audit.sql)
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.knowledge_articles;
    create trigger audit_row_change after insert or update or delete on public.knowledge_articles
      for each row execute function public.audit_row_change();
  end if;
end;
$$;

commit;
