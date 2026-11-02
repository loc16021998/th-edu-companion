-- =============================================================================
-- Thông báo học phí kèm mã QR thanh toán.
--
-- Khi phát hành khoản thu, thông báo cho phụ huynh nói rõ: chạm vào thông báo → mở mã VietQR của ĐÚNG khoản đó,
-- đã điền sẵn số tiền còn phải đóng + nội dung chuyển khoản (app tự mở QR theo ref_id = mã khoản thu).
-- Tài khoản nhận tiền: Quản trị → Quản lý tài chính → Cài đặt (bảng payment_config, apply-finance.sql).
--
-- Cần đã chạy: apply-admin-center.sql (fees_issued_notify, notify_parent_ref). Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================
begin;

create or replace function public.fees_issued_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  select public.given_name(s.full_name) into v_name from public.students s where s.id = new.student_id;
  perform public.notify_parent_ref(
    new.student_id,
    'fee_issued'::text::public.notification_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    new.id,
    format('Thông báo học phí của bé %s: %s', coalesce(v_name, ''), new.title),
    format('Số tiền %s đ', to_char(new.amount - coalesce(new.paid_amount, 0), 'FM999G999G999G999'))
      || case when new.due_date is not null then format(', hạn đóng %s', to_char(new.due_date, 'DD/MM/YYYY')) else '' end
      || '. Chạm để mở mã QR thanh toán — đã điền sẵn số tiền, ba mẹ chỉ cần quét bằng app ngân hàng.'
  );
  return new;
end;
$$;

commit;
