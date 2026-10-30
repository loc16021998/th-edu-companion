-- Gỡ toàn bộ dữ liệu demo (học sinh → cascade điểm danh, nhận xét, học phí; tài khoản → cascade profile, phân công).
-- Ảnh trên Storage: chạy `node scripts/seed-demo-media.mjs --remove` TRƯỚC file này (cần tài khoản giáo viên demo để xoá).
begin;
delete from public.students where id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002');
delete from public.students where id::text like 'd2000000-0000-4000-8000-%';
delete from auth.users where id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002');
commit;
