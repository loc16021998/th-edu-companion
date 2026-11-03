-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Trợ lý viết nhận xét Sổ liên lạc — phần quản trị: bật/tắt, văn phong, câu mẫu chung, thống kê. Chạy lại vẫn an toàn.
-- =============================================================================
-- Trợ lý viết nhận xét Sổ liên lạc — phần quản trị (Quản trị → Sổ liên lạc → Quản lý Trợ lý).
--
--  A. report_ai_settings (1 dòng): bật/tắt trợ lý cho giáo viên, bật/tắt gọi AI (tắt → chỉ gợi ý theo mẫu),
--     lưu ý văn phong của trung tâm (thêm vào hướng dẫn cho AI).
--  B. report_note_templates: câu mẫu chung của trung tâm — mọi giáo viên thấy trong trợ lý; {tên} = tên gọi của bé.
--  C. ai_note_events: nhật ký mỗi lần bấm gợi ý (ai / template) — thống kê sử dụng cho quản trị. Không lưu nội dung.
--
-- Đọc cài đặt + câu mẫu đang bật: mọi tài khoản đăng nhập. Sửa: chỉ quản trị. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

-- ---- A. Cài đặt -----------------------------------------------------------------------------------
create table if not exists public.report_ai_settings (
  id                 boolean primary key default true,
  assistant_enabled  boolean not null default true,
  ai_enabled         boolean not null default true,
  style_note         text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id) on delete set null,
  constraint report_ai_settings_single check (id),
  constraint report_ai_settings_style check (style_note is null or length(style_note) <= 500)
);
insert into public.report_ai_settings (id) values (true) on conflict do nothing;

alter table public.report_ai_settings enable row level security;
revoke all on public.report_ai_settings from anon;
drop policy if exists "report_ai_settings_read" on public.report_ai_settings;
create policy "report_ai_settings_read" on public.report_ai_settings
  for select to authenticated using (true);
drop policy if exists "admin_all_report_ai_settings" on public.report_ai_settings;
create policy "admin_all_report_ai_settings" on public.report_ai_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- B. Câu mẫu chung ------------------------------------------------------------------------------
create table if not exists public.report_note_templates (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint report_note_templates_content check (length(trim(content)) between 10 and 600)
);
create index if not exists report_note_templates_active_idx on public.report_note_templates (active, created_at desc);

alter table public.report_note_templates enable row level security;
revoke all on public.report_note_templates from anon;
drop policy if exists "report_note_templates_read" on public.report_note_templates;
create policy "report_note_templates_read" on public.report_note_templates
  for select to authenticated using (active or (select public.is_admin()));
drop policy if exists "admin_all_report_note_templates" on public.report_note_templates;
create policy "admin_all_report_note_templates" on public.report_note_templates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- C. Nhật ký sử dụng ----------------------------------------------------------------------------
create table if not exists public.ai_note_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  student_id  uuid references public.students (id) on delete set null,
  source      text not null,
  tag_count   smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint ai_note_events_source check (source in ('ai', 'template'))
);
create index if not exists ai_note_events_created_idx on public.ai_note_events (created_at desc);

alter table public.ai_note_events enable row level security;
revoke all on public.ai_note_events from anon;
-- Giáo viên / quản trị ghi lượt của chính mình; chỉ quản trị đọc thống kê
drop policy if exists "ai_note_events_insert_own" on public.ai_note_events;
create policy "ai_note_events_insert_own" on public.ai_note_events
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.current_user_role() in ('teacher', 'admin'));
drop policy if exists "admin_read_ai_note_events" on public.ai_note_events;
create policy "admin_read_ai_note_events" on public.ai_note_events
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin_delete_ai_note_events" on public.ai_note_events;
create policy "admin_delete_ai_note_events" on public.ai_note_events
  for delete to authenticated using ((select public.is_admin()));

-- Nhật ký & bảo mật: ghi lại mọi thay đổi cài đặt / câu mẫu (nếu đã cài apply-security-audit.sql)
do $$
begin
  if to_regprocedure('public.audit_row_change()') is not null then
    drop trigger if exists audit_row_change on public.report_ai_settings;
    create trigger audit_row_change after insert or update or delete on public.report_ai_settings
      for each row execute function public.audit_row_change();
    drop trigger if exists audit_row_change on public.report_note_templates;
    create trigger audit_row_change after insert or update or delete on public.report_note_templates
      for each row execute function public.audit_row_change();
  end if;
end;
$$;

commit;
