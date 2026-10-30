-- =============================================================================
-- Dữ liệu DEMO cho Parent Portal — chạy lại nhiều lần được (xoá demo cũ trước khi tạo).
-- Gỡ hoàn toàn: chạy supabase/seed/demo-remove.sql
--
-- Tài khoản (mật khẩu chung: Demo@2026)
--   Phụ huynh : phuhuynh.demo@th-edu.local  /  SĐT 0901 234 567
--   Giáo viên : giaovien.demo@th-edu.local  /  SĐT 0907 654 321
-- Ảnh minh hoạ: chạy `node scripts/seed-demo-media.mjs` sau file này.
-- =============================================================================
begin;

-- ---- Dọn demo cũ -------------------------------------------------------------
delete from public.students where id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002');
delete from public.students where id::text like 'd2000000-0000-4000-8000-%';
delete from auth.users where id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002');

-- ---- Tài khoản ----------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
  phone_change_token, email_change_token_current, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'phuhuynh.demo@th-edu.local', '84901234567', extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(), now(),
   '{"provider":"email","providers":["email","phone"]}', '{"full_name":"Nguyễn Thu Trang"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'giaovien.demo@th-edu.local', '84907654321', extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(), now(),
   '{"provider":"email","providers":["email","phone"]}', '{"full_name":"Lê Thị Hương"}', now(), now(),
   '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002');

-- Profile được trigger handle_new_user tạo (role mặc định parent) → cập nhật thông tin
update public.profiles set campus = 'CS1_XALA'
where id = 'd0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'teacher', campus = 'CS1_XALA'
where id = 'd0000000-0000-4000-8000-000000000002';

-- Cô Hương phụ trách lớp của cả 2 bé
insert into public.teacher_assignments (teacher_id, campus, class_name) values
  ('d0000000-0000-4000-8000-000000000002', 'CS1_XALA', 'K1A'),
  ('d0000000-0000-4000-8000-000000000002', 'CS2_NGOTHINHAM', 'L1B');

-- ---- Học sinh -----------------------------------------------------------------
insert into public.students (id, full_name, dob, class_name, parent_id, campus) values
  ('d1000000-0000-4000-8000-000000000001', 'Nguyễn Minh An',  '2021-03-15', 'K1A', 'd0000000-0000-4000-8000-000000000001', 'CS1_XALA'),
  ('d1000000-0000-4000-8000-000000000002', 'Nguyễn Bảo Châu', '2019-08-02', 'L1B', 'd0000000-0000-4000-8000-000000000001', 'CS2_NGOTHINHAM');

-- Bạn cùng lớp (chưa liên kết phụ huynh) — để demo màn điểm danh / sổ liên lạc của giáo viên
insert into public.students (id, full_name, dob, class_name, parent_id, campus)
select ('d2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, name, dob::date, cls, null, campus::public.campus
from (values
  (1,  'Trần Gia Bảo',      '2021-05-02', 'K1A', 'CS1_XALA'),
  (2,  'Lê Khánh Linh',     '2021-01-19', 'K1A', 'CS1_XALA'),
  (3,  'Phạm Đức Minh',     '2021-07-08', 'K1A', 'CS1_XALA'),
  (4,  'Hoàng Ngọc Diệp',   '2021-02-27', 'K1A', 'CS1_XALA'),
  (5,  'Vũ Quang Huy',      '2021-10-11', 'K1A', 'CS1_XALA'),
  (6,  'Đỗ Thảo Vy',        '2021-04-30', 'K1A', 'CS1_XALA'),
  (7,  'Bùi Tuấn Kiệt',     '2021-09-14', 'K1A', 'CS1_XALA'),
  (8,  'Ngô Phương Anh',    '2019-03-21', 'L1B', 'CS2_NGOTHINHAM'),
  (9,  'Đặng Hoàng Nam',    '2019-06-05', 'L1B', 'CS2_NGOTHINHAM'),
  (10, 'Phan Mai Chi',      '2019-11-23', 'L1B', 'CS2_NGOTHINHAM'),
  (11, 'Trịnh Bảo Ngọc',    '2019-01-09', 'L1B', 'CS2_NGOTHINHAM'),
  (12, 'Lý Thành Đạt',      '2019-12-17', 'L1B', 'CS2_NGOTHINHAM')
) as v(n, name, dob, cls, campus);

-- ---- Điểm danh: các ngày Thứ 2–6 từ đầu năm học đến hôm nay --------------------
-- Ngẫu nhiên nhưng cố định (hashtext) để chạy lại cho cùng kết quả.
with today as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d),
days as (
  select g::date as d
  from generate_series('2026-09-03'::date, (select d from today), interval '1 day') g
  where extract(isodow from g) <= 5
),
kids(id, salt) as (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'an'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 'chau')),
roll as (
  select k.id, days.d, abs(hashtext(k.salt || days.d::text)) % 100 as r
  from kids k cross join days
)
insert into public.attendance (student_id, date, status, note)
select id, d,
  (case when r < 6 then 'absent' when r < 18 then 'late' else 'present' end)::public.attendance_status,
  case when r < 3 then 'Nghỉ ốm, gia đình đã xin phép'
       when r < 6 then 'Gia đình có việc riêng'
       when r < 18 then 'Đến lớp lúc 8h10' end
from roll;

-- Đảm bảo tháng hiện tại luôn có đủ các trạng thái để demo lịch điểm danh
-- (chỉ cập nhật ngày đã có bản ghi → tự bỏ qua Thứ 7/CN)
update public.attendance a set status = v.status::public.attendance_status, note = v.note
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 1, 'late',   'Đến lớp lúc 8h10'),
  ('d1000000-0000-4000-8000-000000000001'::uuid, 6, 'absent', 'Nghỉ ốm, gia đình đã xin phép'),
  ('d1000000-0000-4000-8000-000000000001'::uuid, 9, 'late',   'Đến lớp lúc 8h20'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 2, 'absent', 'Gia đình có việc riêng'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 8, 'late',   'Đến lớp lúc 8h05')
) as v(student_id, days_ago, status, note)
where a.student_id = v.student_id
  and a.date = (now() at time zone 'Asia/Ho_Chi_Minh')::date - v.days_ago;

-- Hôm nay: An có mặt, Châu đi muộn (để demo đủ trạng thái)
update public.attendance set status = 'present', note = null
where student_id = 'd1000000-0000-4000-8000-000000000001' and date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;
update public.attendance set status = 'late', note = 'Bé đến lúc 8h15 do tắc đường'
where student_id = 'd1000000-0000-4000-8000-000000000002' and date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

-- ---- Nhận xét hằng ngày cho các ngày bé đi học -----------------------------------
with today as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d),
pool as (select
  array['Con đọc đúng các chữ cái a, ă, â và tìm được tranh tương ứng',
        'Con ghép được vần đơn giản như ba, bà, bé rất nhanh',
        'Con kể lại câu chuyện "Thỏ và Rùa" rõ ràng, tự tin',
        'Con nhận diện được các nét cơ bản và gọi tên đúng',
        'Con thuộc và đọc diễn cảm bài thơ "Bàn tay mẹ"',
        'Con phân biệt được âm b và d, cần luyện thêm âm p'] as tth,
  array['Con cầm bút đúng tư thế, nét chữ tròn đều',
        'Con viết nét móc xuôi đẹp hơn hôm qua',
        'Con cần nhớ ngồi thẳng lưng khi viết',
        'Con tô chữ o, ô, ơ rất cẩn thận, không chờm ra ngoài',
        'Con viết đúng độ cao các con chữ',
        'Nét chữ còn hơi run, cô sẽ hướng dẫn thêm'] as lc,
  array['Con đếm và so sánh đúng trong phạm vi 10',
        'Con giải câu đố hình học nhanh nhất lớp',
        'Con nhận biết đúng hình tròn, hình vuông, hình tam giác',
        'Con làm phép cộng trong phạm vi 5 chính xác',
        'Con cần luyện thêm phần tìm quy luật dãy hình',
        'Con xếp hình tangram rất sáng tạo'] as ttd,
  array['Hôm nay con rất ngoan và hăng hái phát biểu! 🌟',
        'Con ăn hết suất trưa và ngủ trưa ngoan.',
        'Con chơi hoà đồng với các bạn, biết chia sẻ đồ chơi.',
        'Bố mẹ nhắc con mang theo bình nước cá nhân nhé.',
        'Con hơi mệt buổi chiều, gia đình cho con ngủ sớm giúp cô ạ.',
        'Con được cả lớp khen vì giúp bạn dọn đồ chơi. 👏'] as notes
),
src as (
  select a.student_id, a.date,
         abs(hashtext(a.student_id::text || a.date::text)) as h,
         (select d from today) - a.date as age_days
  from public.attendance a
  where a.student_id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002')
    and a.status <> 'absent'
)
insert into public.daily_reports (student_id, teacher_id, date, mood, subjects_summary, media_urls, teacher_note)
select s.student_id, 'd0000000-0000-4000-8000-000000000002', s.date,
  (array['happy','happy','focused','neutral','focused','tired'])[1 + s.h % 6]::public.mood,
  jsonb_build_object(
    'tien_tieu_hoc', jsonb_build_object('rating', 3 + s.h % 3,        'comment', p.tth[1 + s.h % 6]),
    'luyen_chu',     jsonb_build_object('rating', 3 + (s.h / 7) % 3,  'comment', p.lc[1 + (s.h / 7) % 6]),
    'toan_tu_duy',   jsonb_build_object('rating', 3 + (s.h / 49) % 3, 'comment', p.ttd[1 + (s.h / 49) % 6])),
  -- Ảnh cho các buổi trong 7 ngày gần nhất: {student_id}/{date}/{n}.svg
  case when s.age_days between 1 and 7
       then array(select s.student_id || '/' || s.date || '/' || n || '.svg' from generate_series(1, 2 + s.h % 3) n)
       else '{}' end,
  case when s.h % 5 < 2 then p.notes[1 + s.h % 6] end
from src s cross join pool p;

-- Hôm nay: nội dung "đẹp" cố định để demo
update public.daily_reports set
  mood = 'happy',
  subjects_summary = '{
    "tien_tieu_hoc": {"rating": 5, "comment": "Con nhận biết được 5 chữ cái mới và tìm đúng tranh minh hoạ"},
    "luyen_chu":     {"rating": 4, "comment": "Nét chữ tròn đều hơn, con ngồi đúng tư thế cả buổi"},
    "toan_tu_duy":   {"rating": 5, "comment": "Con xếp hình tangram con mèo nhanh nhất lớp!"}
  }',
  media_urls = array(select student_id || '/' || date || '/' || n || '.svg' from generate_series(1, 8) n),
  teacher_note = 'Hôm nay con rất ngoan và hăng hái phát biểu! Buổi chiều con cùng các bạn vẽ tranh chủ đề "Gia đình em" — bố mẹ hỏi con kể lại nhé 🎨'
where student_id = 'd1000000-0000-4000-8000-000000000001' and date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

update public.daily_reports set
  mood = 'focused',
  media_urls = array(select student_id || '/' || date || '/' || n || '.svg' from generate_series(1, 3) n),
  teacher_note = 'Con đến muộn nhưng bắt nhịp bài học rất nhanh.'
where student_id = 'd1000000-0000-4000-8000-000000000002' and date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

-- ---- Học phí -----------------------------------------------------------------------
-- An: đủ trạng thái (đã đóng / còn thiếu / chưa đóng / quá hạn). Châu: đã hoàn tất.
insert into public.fees (student_id, title, amount, paid_amount, due_date) values
  ('d1000000-0000-4000-8000-000000000001', 'Học phí tháng 9/2026',              3500000, 3500000, '2026-09-10'),
  ('d1000000-0000-4000-8000-000000000001', 'Học phí tháng 10/2026',             3500000, 1500000, '2026-10-10'),
  ('d1000000-0000-4000-8000-000000000001', 'Học phí tháng 11/2026',             3500000,       0, '2026-11-10'),
  ('d1000000-0000-4000-8000-000000000001', 'Giáo trình Tiền tiểu học',           450000,  450000, '2026-09-15'),
  ('d1000000-0000-4000-8000-000000000001', 'Dụng cụ học tập (bút chì, vở ô li)', 280000,       0, '2026-10-31'),
  ('d1000000-0000-4000-8000-000000000002', 'Học phí tháng 9/2026',              3800000, 3800000, '2026-09-10'),
  ('d1000000-0000-4000-8000-000000000002', 'Học phí tháng 10/2026',             3800000, 3800000, '2026-10-10'),
  ('d1000000-0000-4000-8000-000000000002', 'Giáo trình Luyện chữ đẹp',           320000,  320000, '2026-09-15');

commit;
