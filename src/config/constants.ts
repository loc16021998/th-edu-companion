import type { Enums } from "@/types/database.types";

export const APP_NAME = "TH EDU Companion";
/** Tên dưới icon màn hình chính (≤ 12 ký tự để không bị cắt). */
export const APP_SHORT_NAME = "TH EDU";
/** Xanh thương hiệu TH EDU — khớp --primary trong globals.css. */
/** Edu Blue — màu thương hiệu (thanh trạng thái điện thoại, manifest PWA). Đồng bộ với --primary trong globals.css. */
export const BRAND_COLOR = "#1E4FB0";

/** Thông tin đơn vị hiển thị ở footer. `tel`: số dạng quốc tế cho link gọi điện. */
export const ORGANIZATION = {
  name: "HỆ THỐNG GIÁO DỤC TH EDU",
  campuses: [
    { label: "CS1", address: "Xa La - Hà Đông - Hà Nội" },
    { label: "CS2", address: "Ngô Thì Nhậm - Hà Đông - Hà Nội" },
  ],
  phones: [
    { display: "0978.951.289", tel: "+84978951289" },
    { display: "098.219.4144", tel: "+84982194144" },
  ],
} as const;

/** Bucket PRIVATE chứa ảnh/video hoạt động; đường dẫn: {student_id}/{yyyy-mm-dd}/{file}. */
export const MEDIA_BUCKET = "student-activities";

export const CAMPUS_LABELS: Record<Enums<"campus">, string> = {
  CS1_XALA: "CS1 Xa La",
  CS2_NGOTHINHAM: "CS2 Ngô Thì Nhậm",
};

export const ROLE_LABELS: Record<Enums<"roles">, string> = {
  admin: "Quản trị",
  teacher: "Giáo viên",
  parent: "Phụ huynh",
};

export const ATTENDANCE_LABELS: Record<Enums<"attendance_status">, string> = {
  present: "Có mặt",
  absent: "Nghỉ học",
  late: "Đi muộn",
  absent_with_permission: "Nghỉ có phép",
};

/** Các trạng thái nghỉ (không đến lớp). "Nghỉ có phép" (đơn xin nghỉ được duyệt) không tính vào tỷ lệ chuyên cần. */
export function isAbsence(status: Enums<"attendance_status"> | null | undefined): boolean {
  return status === "absent" || status === "absent_with_permission";
}

/** Đếm theo trạng thái điểm danh (đủ mọi trạng thái, kể cả "Nghỉ có phép"). */
export function countAttendance(statuses: Iterable<Enums<"attendance_status">>) {
  const count: Record<Enums<"attendance_status">, number> = { present: 0, late: 0, absent: 0, absent_with_permission: 0 };
  for (const s of statuses) count[s] += 1;
  return count;
}

export const MOOD_LABELS: Record<Enums<"mood">, string> = {
  happy: "Vui vẻ",
  neutral: "Bình thường",
  focused: "Tập trung",
  tired: "Mệt mỏi",
};

export const FEE_STATUS_LABELS: Record<Enums<"fee_status">, string> = {
  unpaid: "Chưa đóng",
  partial: "Còn thiếu",
  paid: "Đã thanh toán",
};

/** Các môn trong subjects_summary (key JSONB → tên hiển thị). */
export const SUBJECTS = {
  tien_tieu_hoc: "Tiền tiểu học",
  luyen_chu: "Luyện chữ đẹp",
  toan_tu_duy: "Toán tư duy",
} as const;

export type SubjectKey = keyof typeof SUBJECTS;

/** Tiêu chí đánh giá chi tiết từng môn (chấm 1–5 sao, không bắt buộc) — dùng cho biểu đồ tiến bộ. */
export const SUBJECT_CRITERIA = {
  tien_tieu_hoc: { nhan_biet_mat_chu: "Nhận biết mặt chữ", ghep_van: "Ghép vần", tap_trung: "Khả năng tập trung" },
  luyen_chu: { deu_net: "Độ đều nét", khoang_cach: "Khoảng cách chữ", tu_the: "Tư thế ngồi & cầm bút" },
  toan_tu_duy: { tinh_nham: "Khả năng tính nhẩm", logic_hinh_khoi: "Logic hình khối", toc_do_phan_xa: "Tốc độ phản xạ" },
} as const satisfies Record<SubjectKey, Record<string, string>>;

export type CriterionKey<S extends SubjectKey> = keyof (typeof SUBJECT_CRITERIA)[S];
