// Hằng số dùng chung server + client cho bảng tin hoạt động của quản trị viên.

export const FEED_CATEGORIES = {
  feedback: { label: "Phản hồi", tone: "bg-sky-100 text-sky-700" },
  leave: { label: "Đơn xin nghỉ", tone: "bg-indigo-100 text-indigo-700" },
  chat: { label: "Tin nhắn", tone: "bg-violet-100 text-violet-700" },
  homework: { label: "Bài tập", tone: "bg-teal-100 text-teal-700" },
  daily_report: { label: "Sổ liên lạc", tone: "bg-orange-100 text-orange-700" },
  attendance: { label: "Điểm danh", tone: "bg-emerald-100 text-emerald-700" },
  summary: { label: "Tổng kết tháng", tone: "bg-amber-100 text-amber-800" },
  payment: { label: "Thanh toán", tone: "bg-lime-100 text-lime-800" },
  admissions: { label: "Tuyển sinh", tone: "bg-emerald-100 text-emerald-700" },
  consultation: { label: "Lịch hẹn", tone: "bg-indigo-100 text-indigo-700" },
} as const;
export type FeedCategory = keyof typeof FEED_CATEGORIES;
export const FEED_CATEGORY_KEYS = Object.keys(FEED_CATEGORIES) as FeedCategory[];

/** Bộ lọc trên trang: tất cả / theo người gửi / theo loại */
export const FEED_FILTERS = ["all", "parent", "teacher", ...FEED_CATEGORY_KEYS] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
export const FEED_FILTER_LABEL: Record<FeedFilter, string> = {
  all: "Tất cả",
  parent: "Từ phụ huynh",
  teacher: "Từ giáo viên",
  ...Object.fromEntries(FEED_CATEGORY_KEYS.map((k) => [k, FEED_CATEGORIES[k].label])),
} as Record<FeedFilter, string>;

export const ADMIN_FEED_PATH = "/admin/notifications";
