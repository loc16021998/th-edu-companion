/**
 * AI phân tích bài tập & chữ viết — phần dùng chung client + server (không gọi mạng).
 */

/** Tiêu chí AI đánh giá theo môn (khớp yêu cầu sư phạm của TH EDU). */
export const REVIEW_CRITERIA = {
  luyen_chu: ["Độ đều nét chữ", "Khoảng cách giữa các con chữ", "Độ nghiêng của chữ", "Tư thế đặt bút / cầm bút"],
  toan_tu_duy: ["Kết quả các phép tính", "Logic hình khối / quy luật", "Trình bày bài làm"],
  tien_tieu_hoc: ["Nhận biết & viết đúng mặt chữ", "Ghép vần", "Trình bày bài làm"],
  khac: ["Mức độ hoàn thành", "Trình bày bài làm"],
} as const;
export type ReviewSubject = keyof typeof REVIEW_CRITERIA;

export type ReviewCriterion = { label: string; score: number; note: string };
export type HomeworkReview = {
  status: "done" | "unavailable" | "failed";
  subject: string | null;
  readable: boolean;
  criteria: ReviewCriterion[];
  draftComment: string | null;
  suggestedStars: number | null;
  kidPraise: string;
  aiGenerated: boolean;
  /** Ảnh đã phân tích khớp ảnh hiện tại của bài nộp (phụ huynh nộp lại ảnh khác → cần phân tích lại) */
  current: boolean;
};

/** Ảnh bài nộp → khoá so sánh (đổi ảnh → phân tích lại). */
export function mediaKey(paths: string[]): string {
  return [...paths].sort().join("|");
}

/** Ảnh Claude đọc được (video / HEIC bỏ qua). */
export function isAnalyzableImage(path: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}

const STICKERS = ["🌟", "🦄", "🚀", "🐣", "🌈", "🎉", "🐼", "🍭", "🏆", "🦁", "🐬", "🌻"];
const PRAISES = [
  "Oa, {name} ơi! Bài làm hôm nay xịn xò quá, cô và bố mẹ đều thấy con chăm chỉ ghê! {s1}{s2}",
  "{name} siêu nhân chăm học đây rồi! Mỗi nét con viết là một bước tiến, cố lên nhé! {s1}{s2}",
  "Ting ting! {name} vừa mở khoá huy hiệu \"Bé chăm làm bài\"! Con giỏi lắm! {s1}{s2}",
  "Bố mẹ ơi, {name} làm bài nghiêm túc như một nhà khoa học nhí vậy! Thưởng con một cái ôm thật chặt nha! {s1}{s2}",
  "{name} ơi, bài của con đẹp như cầu vồng sau mưa! Ngày mai mình lại cùng cố gắng nhé! {s1}{s2}",
];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Lời khen theo mẫu (khi chưa bật AI / AI lỗi) — cố định theo bài nộp để không đổi mỗi lần mở trang. */
export function templatePraise(childName: string, seed: string): string {
  const h = hash(seed);
  const s1 = STICKERS[h % STICKERS.length]!;
  const s2 = STICKERS[(h >> 4) % STICKERS.length]!;
  return PRAISES[h % PRAISES.length]!.replace("{name}", childName).replace("{s1}", s1).replace("{s2}", s2 === s1 ? "✨" : s2);
}

/** Số sao gợi ý từ điểm trung bình tiêu chí (1–5): ≥4,3 → 3 sao; ≥3,3 → 2 sao; còn lại 1 sao (khích lệ). */
export function starsFromScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg >= 4.3 ? 3 : avg >= 3.3 ? 2 : 1;
}
