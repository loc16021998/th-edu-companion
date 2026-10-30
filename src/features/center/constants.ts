// Hằng số dùng chung server + client cho khu điều hành trung tâm.
import { CAMPUS_LABELS } from "@/config/constants";
import { addMonths, eachDay, endOfMonth } from "@/lib/date";
import type { Enums } from "@/types/database.types";

export type Campus = Enums<"campus">;
export const CAMPUS_LIST = Object.keys(CAMPUS_LABELS) as Campus[];

/** Màu nhận diện cơ sở trên biểu đồ (thứ tự cố định CS1 → CS2; đã kiểm tra mù màu). Luôn kèm nhãn chữ. */
export const CAMPUS_COLOR: Record<Campus, string> = {
  CS1_XALA: "#0284c7",
  CS2_NGOTHINHAM: "#f59e0b",
};

/** Tên ngắn: "CS1 Xa La" / "CS2 Ngô Thì Nhậm" */
export const CAMPUS_SHORT: Record<Campus, string> = {
  CS1_XALA: "CS1 Xa La",
  CS2_NGOTHINHAM: "CS2 Ngô Thì Nhậm",
};

export const ANNOUNCEMENT_CATEGORIES = {
  general: { label: "Thông báo chung", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
  holiday: { label: "Lịch nghỉ lễ", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
  contest: { label: "Cuộc thi luyện chữ", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  extracurricular: { label: "Ngoại khoá", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
} as const;
export type AnnouncementCategory = keyof typeof ANNOUNCEMENT_CATEGORIES;
export const ANNOUNCEMENT_CATEGORY_KEYS = Object.keys(ANNOUNCEMENT_CATEGORIES) as AnnouncementCategory[];

export const AUDIENCES = ["all", "CS1_XALA", "CS2_NGOTHINHAM", "classes"] as const;
export type AudienceChoice = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<AudienceChoice, string> = {
  all: "Toàn bộ phụ huynh",
  CS1_XALA: "Phụ huynh CS1 Xa La",
  CS2_NGOTHINHAM: "Phụ huynh CS2 Ngô Thì Nhậm",
  classes: "Nhóm lớp cụ thể",
};

/** "2026-11-01" → "11/2026" */
export function monthLabel(month: string) {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

/** Tháng liền trước: "2026-11-01" → "2026-10-01" */
export function previousMonth(month: string) {
  return addMonths(month, -1);
}

/** Số buổi học (Thứ 2 – Thứ 7) trong tháng. */
export function schoolDaysInMonth(month: string) {
  return eachDay(month, endOfMonth(month)).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0).length;
}

/** Đơn giá 1 buổi = học phí tháng / số buổi học của tháng, làm tròn tới 1.000đ. */
export function perSessionPrice(monthlyAmount: number, month: string) {
  const days = schoolDaysInMonth(month);
  return days ? Math.round(monthlyAmount / days / 1000) * 1000 : 0;
}

/** Học phí sau khi trừ buổi nghỉ có phép (không âm). */
export function feeAfterExcused(amount: number, excusedSessions: number, perSession: number) {
  return Math.max(amount - excusedSessions * perSession, 0);
}
