import type { PostgrestError } from "@supabase/supabase-js";

/** Thông báo tiếng Việt cho lỗi ghi dữ liệu Supabase (PostgREST). */
export function dbErrorMessage(error: Pick<PostgrestError, "code" | "message">): string {
  switch (error.code) {
    case "42501":
      return "Bạn không có quyền ghi dữ liệu cho học sinh này.";
    case "23503":
      return "Học sinh không tồn tại hoặc đã bị xoá.";
    case "23514":
      return "Dữ liệu không hợp lệ.";
    case "23505":
      return "Dữ liệu bị trùng, vui lòng tải lại trang.";
  }
  if (/fetch|network/i.test(error.message)) return "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.";
  return "Không lưu được dữ liệu. Vui lòng thử lại.";
}
