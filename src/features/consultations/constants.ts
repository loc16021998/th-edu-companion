// Hằng số dùng chung cho lịch hẹn trao đổi (server + client).

export const CONSULT_MODES = ["online", "in_person", "phone"] as const;
export type ConsultMode = (typeof CONSULT_MODES)[number];

export const MODE_LABELS: Record<ConsultMode, { label: string; short: string; emoji: string }> = {
  online: { label: "Trực tuyến (video)", short: "Trực tuyến", emoji: "💻" },
  in_person: { label: "Gặp tại trung tâm", short: "Tại trung tâm", emoji: "🏫" },
  phone: { label: "Gọi điện", short: "Gọi điện", emoji: "📞" },
};
export const modeOf = (m: string): ConsultMode => ((CONSULT_MODES as readonly string[]).includes(m) ? (m as ConsultMode) : "online");

export const SLOT_MINUTES = [15, 20, 30, 45, 60] as const;

/** Khung giờ của quản trị viên dành cho ai (khung của giáo viên luôn là "parents") */
export const AUDIENCES = ["parents", "teachers", "all"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = { parents: "Phụ huynh", teachers: "Giáo viên", all: "Phụ huynh & giáo viên" };
export const audienceOf = (a: string): Audience => ((AUDIENCES as readonly string[]).includes(a) ? (a as Audience) : "parents");

export type PartyRole = "parent" | "teacher" | "admin";
export const partyRoleOf = (r: string | null | undefined): PartyRole => (r === "admin" || r === "teacher" ? r : "parent");
/** Thời lượng khi quản trị viên lên lịch trực tiếp */
export const MEETING_MINUTES = [15, 30, 45, 60, 90] as const;

/** 1 = Thứ 2 … 7 = Chủ nhật (ISO) */
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Thứ 2", short: "T2" },
  { value: 2, label: "Thứ 3", short: "T3" },
  { value: 3, label: "Thứ 4", short: "T4" },
  { value: 4, label: "Thứ 5", short: "T5" },
  { value: 5, label: "Thứ 6", short: "T6" },
  { value: 6, label: "Thứ 7", short: "T7" },
  { value: 7, label: "Chủ nhật", short: "CN" },
];

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
export const STATUS_LABELS: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Chờ xác nhận", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Đã xác nhận", className: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Không nhận", className: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Đã huỷ", className: "bg-slate-100 text-slate-700" },
};
export const statusOf = (s: string): BookingStatus => (s in STATUS_LABELS ? (s as BookingStatus) : "pending");

/** Gợi ý nội dung trao đổi — chạm để điền nhanh */
export const TEACHER_TOPIC_SUGGESTIONS = [
  "Xin ý kiến về giáo án / phương pháp dạy",
  "Trao đổi về một học sinh cần hỗ trợ thêm",
  "Đề xuất hoạt động, cơ sở vật chất cho lớp",
  "Trao đổi về lịch dạy, ca làm việc",
];
export const TOPIC_SUGGESTIONS = [
  "Muốn trao đổi về phương pháp rèn chữ cho bé ở nhà",
  "Tình hình học Toán tư duy của bé gần đây",
  "Nề nếp, tâm lý của bé khi ở lớp",
  "Chuẩn bị cho bé vào lớp 1",
  "Góp ý về chương trình học, dịch vụ của trung tâm",
];

export const CONSULT_MIGRATION_MESSAGE = "Database chưa có lịch hẹn — hãy chạy file supabase/apply-consultations.sql trong Supabase SQL Editor.";

/** Phụ huynh xem trước tối đa 3 tuần */
export const BOOKING_HORIZON_DAYS = 21;
