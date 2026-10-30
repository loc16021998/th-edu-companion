// Sự kiện trong trình duyệt để các phần giao diện (menu, chuông) cập nhật NGAY sau khi người dùng đã xem —
// không phải chờ tín hiệu realtime (có thể chậm / mất khi mạng yếu).

/** Đã đánh dấu đọc 1 cuộc trò chuyện → huy hiệu "Nhắn tin" cập nhật. */
export const CHAT_READ_EVENT = "thedu:chat-read";
/** Quản trị viên đã xem thông báo hoạt động → chuông cập nhật. */
export const ADMIN_FEED_READ_EVENT = "thedu:admin-feed-read";
/** Đã đánh dấu đọc thông báo (mở trang liên quan) → huy hiệu thanh tab + chuông cập nhật. */
export const NOTIFICATIONS_READ_EVENT = "thedu:notifications-read";
