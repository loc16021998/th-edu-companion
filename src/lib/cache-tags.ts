// Tag cache dữ liệu (Next.js unstable_cache / revalidateTag) — dùng chung giữa chỗ đọc và chỗ ghi.

export const CACHE_TAGS = {
  /** Mọi danh sách học sinh (thêm / sửa / chuyển lớp / xoá / đổi phụ huynh) */
  students: "students",
  /** Danh sách con của 1 phụ huynh */
  parentChildren: (parentId: string) => `students:parent:${parentId}`,
  /** Lịch sử điểm danh của 1 học sinh */
  attendance: (studentId: string) => `attendance:${studentId}`,
} as const;
