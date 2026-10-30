// Hằng số dùng chung server + client cho "Góc Khoảnh Khắc".

export const MOMENTS_BUCKET = "moments";
export const MAX_MOMENT_MEDIA = 20;

export const MOMENT_CATEGORIES = {
  class: { label: "Hoạt động lớp", emoji: "🏫" },
  toan_tu_duy: { label: "Toán tư duy", emoji: "🧮" },
  luyen_chu: { label: "Luyện chữ", emoji: "✍️" },
  tien_tieu_hoc: { label: "Tiền tiểu học", emoji: "📖" },
  ngoai_khoa: { label: "Ngoại khoá", emoji: "🎈" },
} as const;
export type MomentCategory = keyof typeof MOMENT_CATEGORIES;
export const MOMENT_CATEGORY_KEYS = Object.keys(MOMENT_CATEGORIES) as MomentCategory[];

export const MOMENT_VISIBILITY = {
  class: { label: "Cả lớp", hint: "Mọi phụ huynh trong lớp đều xem được" },
  tagged: { label: "Nhóm nhỏ", hint: "Chỉ phụ huynh của các bé được gắn thẻ xem được" },
} as const;
export type MomentVisibility = keyof typeof MOMENT_VISIBILITY;

/** {moment_id}/{uuid}.{ext} */
export const MOMENT_PATH_RE = /^[0-9a-f-]{36}\/[\w.-]{1,100}\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm|3gp)$/i;
