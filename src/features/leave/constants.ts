// Hằng số dùng chung server + client cho đơn xin nghỉ học.

export const LEAVE_REASONS = {
  sick: { label: "Bị ốm", emoji: "🤒" },
  family: { label: "Việc gia đình", emoji: "🏠" },
  travel: { label: "Đi xa / du lịch", emoji: "🧳" },
  other: { label: "Lý do khác", emoji: "📝" },
} as const;
export type LeaveReason = keyof typeof LEAVE_REASONS;
export const LEAVE_REASON_KEYS = Object.keys(LEAVE_REASONS) as LeaveReason[];

export const LEAVE_STATUS = {
  pending: { label: "Chờ cô xác nhận", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Cô đã đồng ý", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  rejected: { label: "Chưa được đồng ý", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
  cancelled: { label: "Đã huỷ", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const;
export type LeaveStatus = keyof typeof LEAVE_STATUS;

/** Được báo nghỉ lùi tối đa 7 ngày (ốm hôm qua vẫn báo được), mỗi đơn tối đa 31 ngày. */
export const LEAVE_BACKDATE_DAYS = 7;
export const LEAVE_MAX_DAYS = 31;
