-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Quản trị kênh chat (gỡ tin nhắn). Chạy SAU apply-leave-chat-push.sql. Chạy lại vẫn an toàn.
-- =============================================================================
-- Quản trị kênh chat phụ huynh ↔ giáo viên:
--   - Quản trị viên xem mọi cuộc trò chuyện (đã có từ policy chat_*_select) và GỠ tin nhắn không phù hợp.
--   - Gỡ = xoá nội dung + ảnh, giữ dấu vết (removed_at/removed_by) → hai bên thấy "Tin nhắn đã bị quản trị viên gỡ".
-- Cần đã chạy: apply-leave-chat-push.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

alter table public.chat_messages add column if not exists removed_at timestamptz;
alter table public.chat_messages add column if not exists removed_by uuid references public.profiles (id) on delete set null;

-- Tin đã gỡ không còn nội dung
alter table public.chat_messages drop constraint if exists chat_messages_content;
alter table public.chat_messages add constraint chat_messages_content
  check (removed_at is not null or nullif(trim(body), '') is not null or image_path is not null);

-- Chỉ quản trị viên được gỡ (cập nhật) tin nhắn; người trong cuộc không sửa được tin đã gửi
drop policy if exists "chat_messages_admin_update" on public.chat_messages;
create policy "chat_messages_admin_update" on public.chat_messages
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Gỡ tin cuối cùng → cập nhật dòng xem trước của cuộc trò chuyện
create or replace function public.chat_message_after_remove()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    update public.chat_conversations c
    set last_message_preview = '🚫 Tin nhắn đã bị gỡ'
    where c.id = new.conversation_id and c.last_message_at = new.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_after_remove on public.chat_messages;
create trigger chat_message_after_remove
  after update of removed_at on public.chat_messages
  for each row execute function public.chat_message_after_remove();

-- Quản trị viên xoá được ảnh của tin bị gỡ
drop policy if exists "chat_admin_delete" on storage.objects;
create policy "chat_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat' and (select public.is_admin()));
