-- =============================================================================
-- Quản trị viên trả lời trong cuộc trò chuyện phụ huynh ↔ giáo viên (tin hiện là "Trung tâm TH EDU" ở cả hai phía).
-- Cần đã chạy: apply-leave-chat-push.sql. Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

-- Gửi tin: quản trị viên gửi vào mọi cuộc trò chuyện (đứng tên chính mình)
drop policy if exists "chat_messages_admin_insert" on public.chat_messages;
create policy "chat_messages_admin_insert" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_admin())
    and exists (select 1 from public.chat_conversations c where c.id = conversation_id)
  );

-- Ảnh quản trị viên gửi trong chat: {conversation_id}/{file}
drop policy if exists "chat_admin_insert" on storage.objects;
create policy "chat_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat'
    and (select public.is_admin())
    and exists (select 1 from public.chat_conversations c where c.id = public.safe_uuid((storage.foldername(name))[1]))
  );
