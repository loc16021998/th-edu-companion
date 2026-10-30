// Khảo sát hài lòng định kỳ hàng tháng — dùng chung server + client.
import { SUBJECTS, type SubjectKey } from "@/config/constants";

/** Hiện popup từ ngày này tới hết tháng ("dịp cuối tháng"). */
export const SURVEY_OPEN_DAY = 24;
/** "Để sau" → hỏi lại sau ngần này giờ (lưu trên máy). */
export const SURVEY_SNOOZE_HOURS = 48;
export const SURVEY_COMMENT_MAX = 500;

export const SURVEY_SUBJECTS = SUBJECTS;
export type SurveySubject = SubjectKey;

export const RATING_LABELS = ["", "Rất chưa hài lòng", "Chưa hài lòng", "Bình thường", "Hài lòng", "Rất hài lòng"] as const;

/** Tháng khảo sát (ngày đầu tháng, giờ VN) của ngày `today` (YYYY-MM-DD). */
export function surveyPeriod(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/** Đang trong đợt khảo sát? (từ SURVEY_OPEN_DAY tới hết tháng) */
export function surveyWindowOpen(today: string): boolean {
  return Number(today.slice(8, 10)) >= SURVEY_OPEN_DAY;
}

/** "2026-10-01" → "tháng 10/2026" */
export function periodLabel(period: string): string {
  return `tháng ${Number(period.slice(5, 7))}/${period.slice(0, 4)}`;
}
