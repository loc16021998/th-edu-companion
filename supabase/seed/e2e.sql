-- =============================================================================
-- Dữ liệu cho kiểm thử E2E — CHỈ chạy trên project Supabase THỬ NGHIỆM, không chạy trên dữ liệu thật.
-- Thứ tự: schema.sql → seed/demo.sql → file này. Chạy lại nhiều lần được.
--
-- Bổ sung cho dữ liệu demo:
--   - Tài khoản quản trị test: quantri.e2e@th-edu.local / Demo@2026
--   - Tài khoản nhận học phí (mã VietQR ở trang Học phí của phụ huynh)
--   - Khung giờ tư vấn của cô Hương mọi ngày 08:00–21:00 (phụ huynh luôn có giờ để đặt lịch)
-- =============================================================================
begin;

delete from auth.users where id = 'd0000000-0000-4000-8000-000000000003';

insert into auth.users (
  instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
  phone_change_token, email_change_token_current, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'quantri.e2e@th-edu.local', null, extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(), null,
   '{"provider":"email","providers":["email"]}', '{"full_name":"Quản trị E2E"}', now(), now(),
   '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003',
        jsonb_build_object('sub', 'd0000000-0000-4000-8000-000000000003', 'email', 'quantri.e2e@th-edu.local', 'email_verified', true),
        'email', now(), now(), now());

-- Profile do trigger handle_new_user tạo (mặc định phụ huynh) → nâng thành quản trị
update public.profiles set role = 'admin' where id = 'd0000000-0000-4000-8000-000000000003';

-- Tài khoản nhận học phí (số tài khoản giả — chỉ để sinh mã QR khi test)
insert into public.payment_config (id, bank_bin, bank_name, account_no, account_name)
values (true, '970436', 'Vietcombank', '0123456789', 'TRUNG TAM TH EDU TEST')
on conflict (id) do update set bank_bin = excluded.bank_bin, bank_name = excluded.bank_name,
  account_no = excluded.account_no, account_name = excluded.account_name, updated_at = now();

-- Khung giờ tư vấn của cô Hương cho phụ huynh
delete from public.consultation_availability where host_id = 'd0000000-0000-4000-8000-000000000002';
insert into public.consultation_availability (host_id, weekday, start_time, end_time, slot_minutes, mode, meeting_url, audience)
select 'd0000000-0000-4000-8000-000000000002', d, '08:00', '21:00', 30, 'online', 'https://meet.google.com/e2e-test-room', 'parents'
from generate_series(1, 7) d;

commit;
