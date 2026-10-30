-- =============================================================================
-- Chuyển media nhận xét hằng ngày sang bucket `student-activities`.
-- Bucket PRIVATE (ảnh trẻ em): media_urls lưu đường dẫn {student_id}/{yyyy-mm-dd}/{file},
-- phụ huynh xem qua signed URL ngắn hạn do server tạo.
-- =============================================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-activities', 'student-activities', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "student_activities_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.is_parent_of(public.safe_uuid((storage.foldername(name))[1]))
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Giáo viên chỉ tải lên thư mục của học sinh mình phụ trách
create policy "student_activities_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "student_activities_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-activities'
    and (
      (select public.is_admin())
      or public.teacher_can_access_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Gỡ bucket cũ `daily-media`
drop policy if exists "daily_media_read" on storage.objects;
drop policy if exists "daily_media_write" on storage.objects;
drop policy if exists "daily_media_delete" on storage.objects;

do $$
begin
  delete from storage.buckets where id = 'daily-media';
exception when others then
  -- Một số phiên bản Supabase chặn xoá trực tiếp bảng storage → xoá thủ công trong Dashboard
  raise notice 'Không xoá được bucket daily-media (%): hãy xoá trong Dashboard > Storage', sqlerrm;
end $$;

commit;
