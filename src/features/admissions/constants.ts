// Hằng số dùng chung server + client cho CRM Tuyển sinh.
import { CAMPUS_LABELS, SUBJECTS, SUBJECT_CRITERIA, type SubjectKey } from "@/config/constants";
import type { Enums } from "@/types/database.types";

export const LEAD_STATUSES = ["new", "contacted", "trial_booked", "enrolled", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Cột Kanban: nhãn, màu nhấn, gợi ý việc cần làm. */
export const LEAD_STATUS: Record<LeadStatus, { label: string; hint: string; dot: string; badge: string; column: string }> = {
  new: {
    label: "Mới",
    hint: "Chưa liên hệ",
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
    column: "bg-sky-50/60",
  },
  contacted: {
    label: "Đã liên hệ",
    hint: "Đang tư vấn",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    column: "bg-amber-50/60",
  },
  trial_booked: {
    label: "Hẹn học thử",
    hint: "Đã xếp lịch",
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
    column: "bg-violet-50/60",
  },
  enrolled: {
    label: "Đã nhập học",
    hint: "Học viên chính thức",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    column: "bg-emerald-50/60",
  },
  lost: {
    label: "Không theo học",
    hint: "Đã dừng tư vấn",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    column: "bg-slate-50",
  },
};

export const LEAD_SOURCES = {
  facebook: "Facebook",
  zalo: "Zalo",
  gioi_thieu: "Người quen giới thiệu",
  walk_in: "Đến trực tiếp",
  website: "Website",
  hotline: "Hotline",
  khac: "Khác",
} as const;
export type LeadSource = keyof typeof LEAD_SOURCES;

export const PROGRAM_KEYS = Object.keys(SUBJECTS) as SubjectKey[];

export const TRIAL_STATUS = {
  scheduled: {
    label: "Đã xếp lịch",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  completed: {
    label: "Đã học thử",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  no_show: {
    label: "Bé không đến",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  cancelled: {
    label: "Đã huỷ",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
  },
} as const;
export type TrialStatus = keyof typeof TRIAL_STATUS;

export const CONFIRMATION_STATUS = {
  pending: {
    label: "Chưa gửi xác nhận",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  sent: {
    label: "Đã gửi Zalo/SMS",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  manual: {
    label: "Đã báo phụ huynh",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  failed: {
    label: "Gửi tự động lỗi",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
  },
} as const;
export type ConfirmationStatus = keyof typeof CONFIRMATION_STATUS;

/** Mức năng lực ban đầu (giáo viên chọn sau buổi học thử). */
export const ASSESSMENT_LEVELS = {
  1: {
    label: "Cần hỗ trợ thêm",
    emoji: "🌱",
    tone: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  2: {
    label: "Đạt yêu cầu",
    emoji: "🌿",
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  3: {
    label: "Khá tốt",
    emoji: "🌳",
    tone: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  4: {
    label: "Nổi trội",
    emoji: "🌟",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
} as const;
export type AssessmentLevel = keyof typeof ASSESSMENT_LEVELS;

/** Kỹ năng chấm nhanh 1–5: tiêu chí của chương trình + 2 tiêu chí chung. */
export const GENERAL_SKILLS = {
  hop_tac: "Hợp tác với cô & bạn",
  tu_tin: "Tự tin, mạnh dạn",
} as const;
export function trialSkills(program: string): Record<string, string> {
  const own = SUBJECT_CRITERIA[program as SubjectKey] ?? {};
  return { ...own, ...GENERAL_SKILLS };
}

export function programLabel(program: string) {
  return SUBJECTS[program as SubjectKey] ?? program;
}

export const LEAD_NOTES_MAX = 2000;
export const TRIAL_TEXT_MAX = 1000;

const TZ = "Asia/Ho_Chi_Minh";
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const shortFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "14:30, Thứ Bảy, 02/11/2026" */
export function trialWhen(iso: string) {
  return `${timeFmt.format(new Date(iso))}, ${dayFmt.format(new Date(iso))}`;
}
export function trialWhenShort(iso: string) {
  return shortFmt.format(new Date(iso));
}

export const localPhone = (p: string) => p.replace(/^\+?84/, "0");

/** "Chị Hương" giữ nguyên; "Nguyễn Văn A" → "anh/chị Nguyễn Văn A" (tránh "anh/chị Chị Hương"). */
export function addressParent(name: string) {
  const n = name.trim();
  return /^(anh|chị|cô|chú|bác|ông|bà|em)\s/iu.test(n) ? n : `anh/chị ${n}`;
}

/** Tin nhắn xác nhận lịch học thử — gửi qua Zalo ZNS/SMS (webhook) hoặc tư vấn viên sao chép gửi tay. */
export function trialConfirmationText(t: {
  parentName: string;
  childName: string;
  program: string;
  scheduledAt: string;
  campus: Enums<"campus">;
  className?: string | null;
}) {
  return [
    `TH EDU xin chào ${addressParent(t.parentName)}!`,
    `Nhà trường xác nhận lịch học thử miễn phí của bé ${t.childName.trim()}:`,
    `• Chương trình: ${programLabel(t.program)}`,
    `• Thời gian: ${trialWhen(t.scheduledAt)}`,
    `• Địa điểm: ${CAMPUS_LABELS[t.campus]}${t.className ? ` – lớp ${t.className}` : ""}`,
    "Anh/chị vui lòng cho bé đến trước 10 phút. Cần đổi lịch, anh/chị nhắn lại số này giúp nhà trường nhé. Cảm ơn anh/chị!",
  ].join("\n");
}
