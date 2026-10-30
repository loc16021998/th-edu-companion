// Bé đang được chọn (phụ huynh nhiều con) — dùng chung server + client.
// Lưu ở cookie (server đọc được ngay khi render → không có "nháy" dữ liệu bé khác) + localStorage (dự phòng khi trình duyệt
// xoá cookie do script đặt, vd. Safari giới hạn 7 ngày). Chỉ là lựa chọn hiển thị: server LUÔN kiểm tra id thuộc con của
// phụ huynh đang đăng nhập (id lạ / của gia đình khác → bỏ qua, về bé đầu tiên).

export const SELECTED_CHILD_COOKIE = "th-edu-child";
export const SELECTED_CHILD_STORAGE = "th-edu:selected-child";
export const SELECTED_CHILD_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isChildId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/**
 * Bé đang xem: ?child= trên URL → lựa chọn đã ghi nhớ (cookie) → bé đầu tiên.
 * Chỉ chọn trong danh sách con CỦA phụ huynh đang đăng nhập — id lạ (cookie cũ của gia đình khác, sửa tay URL) bị bỏ qua.
 */
export function pickChild<T extends { id: string }>(students: T[], fromUrl: string | null | undefined, remembered: string | null | undefined): T | null {
  return (
    (fromUrl ? students.find((s) => s.id === fromUrl) : undefined) ??
    (isChildId(remembered) ? students.find((s) => s.id === remembered) : undefined) ??
    students[0] ??
    null
  );
}
