-- Dán TOÀN BỘ file này vào Supabase Dashboard → SQL Editor → Run (không bôi đen gì).
-- Thông báo cho phụ huynh khi nhà trường trả lời phản hồi. Chạy SAU apply-feedback-migration.sql. Chạy lại vẫn an toàn.
-- =============================================================================
-- Thông báo cho phụ huynh khi nhà trường trả lời phản hồi (bảng feedback).
-- Cần chạy SAU migration 20261024000000_feedback.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Lưu ý: SQL Editor chạy cả script trong MỘT giao dịch, nên giá trị enum 'feedback' vừa thêm
-- KHÔNG được dùng trực tiếp trong script (lỗi 55P04). Ràng buộc bên dưới so sánh dạng text
-- (type::text), còn trigger chỉ dùng giá trị mới khi chạy — sau khi giao dịch đã commit.
-- =============================================================================

alter type public.notification_type add value if not exists 'feedback';

-- Phản hồi có thể không gắn với bé nào → student_id được phép rỗng cho loại 'feedback'
alter table public.notifications alter column student_id drop not null;
alter table public.notifications
  add column if not exists feedback_id uuid references public.feedback (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_student_required;
alter table public.notifications
  add constraint notifications_student_required check (type::text = 'feedback' or student_id is not null);

-- Mỗi phản hồi chỉ 1 thông báo; trả lời lại → làm mới thông báo đó
create unique index if not exists notifications_feedback_unique
  on public.notifications (feedback_id) where feedback_id is not null;

create or replace function public.feedback_reply_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_body text;
begin
  if new.admin_reply is null or trim(new.admin_reply) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.admin_reply is not distinct from old.admin_reply then
    return new; -- chỉ đổi trạng thái, không đổi nội dung trả lời
  end if;

  v_body := trim(new.admin_reply);
  if length(v_body) > 160 then
    v_body := left(v_body, 157) || '...';
  end if;

  insert into public.notifications (recipient_id, student_id, feedback_id, type, ref_date, title, body)
  values (
    new.parent_id,
    new.student_id,
    new.id,
    'feedback'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'Nhà trường đã trả lời phản hồi của anh/chị',
    v_body
  )
  on conflict (feedback_id) where feedback_id is not null do update
    set title      = excluded.title,
        body       = excluded.body,
        ref_date   = excluded.ref_date,
        read_at    = null,
        created_at = now();
  return new;
end;
$$;

drop trigger if exists feedback_reply_notify on public.feedback;
create trigger feedback_reply_notify
  after insert or update of admin_reply on public.feedback
  for each row execute function public.feedback_reply_notify();
