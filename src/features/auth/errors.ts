import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

/** Chuyển lỗi Supabase Auth thành thông báo tiếng Việt cho người dùng cuối. */
export function getLoginErrorMessage(error: AuthError, via: "email" | "phone"): string {
  if (isAuthRetryableFetchError(error)) {
    return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  }

  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return via === "email" ? "Email hoặc mật khẩu không đúng." : "Số điện thoại hoặc mật khẩu không đúng.";
    case "email_not_confirmed":
      return "Email chưa được xác nhận. Vui lòng kiểm tra hộp thư hoặc liên hệ nhà trường.";
    case "phone_not_confirmed":
      return "Số điện thoại chưa được xác thực. Vui lòng liên hệ nhà trường.";
    case "phone_provider_disabled":
      return "Đăng nhập bằng số điện thoại đang tạm tắt. Vui lòng dùng email.";
    case "email_provider_disabled":
      return "Đăng nhập bằng email đang tạm tắt. Vui lòng dùng số điện thoại.";
    case "user_banned":
      return "Tài khoản đã bị khoá. Vui lòng liên hệ nhà trường.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.";
    case "validation_failed":
      return "Thông tin đăng nhập không hợp lệ.";
  }

  if ((error.status ?? 0) >= 500) return "Hệ thống đang bận. Vui lòng thử lại sau ít phút.";
  return "Đăng nhập không thành công. Vui lòng thử lại.";
}

/** Thông báo hiển thị trên /login khi bị middleware/layout chuyển hướng về (?error=...). */
export const LOGIN_NOTICES: Record<string, string> = {
  no_profile: "Tài khoản chưa được nhà trường cấp quyền truy cập. Vui lòng liên hệ quản trị viên.",
  session_expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  admin_only:
    "Trang quản trị chỉ dành cho quản trị viên. Vui lòng đăng nhập bằng tài khoản quản trị (tài khoản phụ huynh / giáo viên đang dùng sẽ được đăng xuất).",
};
