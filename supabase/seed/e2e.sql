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

-- Truyền thông trung tâm: lớp L1B (CS2) là lớp Luyện chữ → test nút "Riêng lớp Luyện chữ"
update public.classes set subject = 'luyen_chu' where campus = 'CS2_NGOTHINHAM' and name = 'L1B';

-- AI phân tích bài tập: 2 bài luyện chữ lớp K1A —
--   (1) bé An đã nộp + có sẵn bản chấm nháp mẫu (để test "Chấp nhận nhận xét" khi máy test chưa có khoá AI);
--   (2) bài trống để phụ huynh test tự nộp ảnh thật.
delete from public.homework_assignments where id in ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000002');
insert into public.homework_assignments (id, campus, class_name, title, instructions, subject, submission_type, due_date, teacher_id) values
  ('e2e00000-0000-4000-8000-000000000001', 'CS1_XALA', 'K1A', 'Luyện chữ: dòng "mẹ đi chợ" (E2E)', 'Viết 3 dòng, chú ý độ cao chữ h, k.', 'luyen_chu', 'photo',
   (now() at time zone 'Asia/Ho_Chi_Minh')::date + 3, 'd0000000-0000-4000-8000-000000000002'),
  ('e2e00000-0000-4000-8000-000000000002', 'CS1_XALA', 'K1A', 'Toán tư duy: đếm hình (E2E)', 'Chụp ảnh bài làm trong vở.', 'toan_tu_duy', 'photo',
   (now() at time zone 'Asia/Ho_Chi_Minh')::date + 3, 'd0000000-0000-4000-8000-000000000002');
insert into public.homework_submissions (id, assignment_id, student_id, parent_id, media_paths, status) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', array['d1000000-0000-4000-8000-000000000001/e2e00000-0000-4000-8000-000000000001/vo-luyen-chu.jpg'], 'submitted');
do $$
begin
  if to_regclass('public.homework_ai_reviews') is not null then
    insert into public.homework_ai_reviews (submission_id, media_key, status, subject, readable, criteria, draft_comment, suggested_stars, kid_praise, ai_generated)
    values ('e2e00000-0000-4000-8000-0000000000a1',
            'd1000000-0000-4000-8000-000000000001/e2e00000-0000-4000-8000-000000000001/vo-luyen-chu.jpg',
            'done', 'luyen_chu', true,
            '[{"label":"Độ đều nét chữ","score":4,"note":"Nét đều, tròn trịa"},{"label":"Khoảng cách giữa các con chữ","score":3,"note":"Khoảng cách giữa \"mẹ\" và \"đi\" hơi rộng"},{"label":"Độ nghiêng của chữ","score":4,"note":"Chữ đứng thẳng, đều"},{"label":"Tư thế đặt bút / cầm bút","score":0,"note":"Ảnh chưa thấy rõ"}]',
            'Bài làm rất sạch sẽ, các con chữ h, k viết đúng độ cao. Con chú ý khoảng cách giữa "mẹ" và "đi" hẹp lại một chút nhé.',
            2, 'An ơi, nét chữ của con tròn xoe như những chú ong chăm chỉ! Cô thưởng con một tràng pháo tay nha! 🐝🎉', true)
    on conflict (submission_id) do update set media_key = excluded.media_key, status = excluded.status, criteria = excluded.criteria,
      draft_comment = excluded.draft_comment, suggested_stars = excluded.suggested_stars, kid_praise = excluded.kid_praise;
  end if;
end;
$$;

-- Cảnh báo sớm: bé Gia Bảo (K1A, cùng lớp bé An) có đủ dấu hiệu — nghỉ 3 buổi liên tiếp gần nhất,
-- Toán tư duy từ 5★ xuống 2★, hay được nhắc chưa tập trung. Ngày tính theo hôm nay (bỏ Chủ nhật) → chạy ngày nào cũng đúng.
delete from public.attendance where student_id = 'd2000000-0000-4000-8000-000000000001';
delete from public.daily_reports where student_id = 'd2000000-0000-4000-8000-000000000001';
with school_days as (
  select d::date as d, row_number() over (order by d desc) as n
  from generate_series((now() at time zone 'Asia/Ho_Chi_Minh')::date - 29, (now() at time zone 'Asia/Ho_Chi_Minh')::date, interval '1 day') d
  where extract(isodow from d) < 7
)
insert into public.attendance (student_id, date, status, note)
select 'd2000000-0000-4000-8000-000000000001', d, (case when n <= 3 then 'absent' else 'present' end)::public.attendance_status,
       case when n <= 3 then 'Gia đình chưa báo lý do' end
from school_days;

with school_days as (
  select d::date as d, row_number() over (order by d desc) as n
  from generate_series((now() at time zone 'Asia/Ho_Chi_Minh')::date - 29, (now() at time zone 'Asia/Ho_Chi_Minh')::date, interval '1 day') d
  where extract(isodow from d) < 7
)
insert into public.daily_reports (student_id, teacher_id, date, mood, subjects_summary, media_urls, teacher_note)
select 'd2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', d,
  (case when n <= 10 then 'tired' else 'happy' end)::public.mood,
  case when n <= 10
    then '{"toan_tu_duy": {"rating": 2, "comment": "Con chưa tập trung, cần cố gắng hơn", "criteria": {"tinh_nham": 2}}}'::jsonb
    else '{"toan_tu_duy": {"rating": 5, "comment": "Con làm bài rất tốt", "criteria": {"tinh_nham": 5}}}'::jsonb
  end,
  '{}', case when n <= 10 then 'Con hay nói chuyện trong giờ' end
from school_days
where n between 4 and 22;

commit;
