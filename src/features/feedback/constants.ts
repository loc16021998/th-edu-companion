import type { Enums } from "@/types/database.types";

/** Chủ đề phụ huynh chọn khi gửi (khớp ràng buộc feedback_category_valid trong DB). */
export const FEEDBACK_CATEGORIES = {
  hoc_phi: "Học phí",
  chuong_trinh: "Chương trình học",
  giao_vien: "Giáo viên",
  co_so_vat_chat: "Cơ sở vật chất",
  ung_dung: "Ứng dụng TH EDU",
  khac: "Khác",
} as const;

/** Chủ đề của phản hồi cũ (trước khi đổi bộ chủ đề) — chỉ để hiển thị. */
const LEGACY_CATEGORIES: Record<string, string> = { hoc_tap: "Tình hình học tập", lich_hoc: "Lịch học" };

export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export const FEEDBACK_CATEGORY_KEYS = Object.keys(FEEDBACK_CATEGORIES) as [FeedbackCategory, ...FeedbackCategory[]];

export function feedbackCategoryLabel(key: string): string {
  return key in FEEDBACK_CATEGORIES ? FEEDBACK_CATEGORIES[key as FeedbackCategory] : (LEGACY_CATEGORIES[key] ?? FEEDBACK_CATEGORIES.khac);
}

/** Loại: góp ý / báo lỗi / thắc mắc */
export const FEEDBACK_KINDS = {
  gop_y: { label: "Góp ý", emoji: "💡", hint: "Đề xuất để trung tâm làm tốt hơn" },
  bao_loi: { label: "Báo lỗi", emoji: "🐞", hint: "Ứng dụng / thông tin bị sai" },
  thac_mac: { label: "Thắc mắc", emoji: "❓", hint: "Cần trung tâm giải đáp" },
} as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
export const FEEDBACK_KIND_KEYS = Object.keys(FEEDBACK_KINDS) as [FeedbackKind, ...FeedbackKind[]];

export function feedbackKindLabel(key: string): string {
  return FEEDBACK_KINDS[key as FeedbackKind]?.label ?? FEEDBACK_KINDS.gop_y.label;
}

/** Nhãn trạng thái — quản trị viên */
export const FEEDBACK_STATUS: Record<Enums<"feedback_status">, { label: string; badge: string }> = {
  new: { label: "Chưa xử lý", badge: "bg-sky-100 text-sky-700 ring-sky-200" },
  in_progress: { label: "Đang giải quyết", badge: "bg-amber-100 text-amber-700 ring-amber-200" },
  resolved: { label: "Đã hoàn tất", badge: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
};

/** Nhãn trạng thái — phụ huynh (góc nhìn người gửi) */
export const FEEDBACK_STATUS_PARENT: Record<Enums<"feedback_status">, string> = {
  new: "Đã gửi",
  in_progress: "Đang giải quyết",
  resolved: "Đã hoàn tất",
};

export const FEEDBACK_MAX = 2000;
