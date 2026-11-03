/**
 * "Câu mẫu của tôi" — nhận xét hay dùng, lưu NGAY TRÊN MÁY giáo viên (localStorage) → chọn lại được cả khi mất mạng.
 * Tên bé trong câu được thay bằng {tên} khi lưu, rồi điền tên bé đang viết khi chèn → 1 câu dùng cho cả lớp.
 */
export const NAME_TOKEN = "{tên}";
export const MAX_FAVORITES = 30;
const KEY = "th-edu:report-note-favorites:v1";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Hôm nay bé An rất ngoan" → "Hôm nay bé {tên} rất ngoan" (chỉ thay đúng cả từ, không đụng "Anh", "Annie"). */
export function toTemplate(note: string, childName: string): string {
  const text = note.trim();
  if (!childName.trim()) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(childName.trim())}(?![\\p{L}\\p{N}])`, "gu"), NAME_TOKEN);
}

/** Nhận xét có nhắc tên bé (đúng cả từ)? */
export function mentionsName(note: string, childName: string): boolean {
  return Boolean(childName.trim()) && toTemplate(note, childName).includes(NAME_TOKEN);
}

/** Câu dùng chung cho cả lớp: "bé An" / "An" → "con". */
export function genericNote(note: string, childName: string): string {
  return toTemplate(note, childName)
    .replace(/\b([Bb])é \{tên\}/g, (_, b: string) => (b === "B" ? "Con" : "con"))
    .split(NAME_TOKEN)
    .join("con");
}

export function fillTemplate(template: string, childName: string): string {
  return template.split(NAME_TOKEN).join(childName);
}

export function readFavorites(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* chế độ ẩn danh / bộ nhớ đầy — câu mẫu chỉ còn trong phiên này */
  }
}

/** Thêm lên đầu danh sách (bỏ trùng); quá giới hạn → bỏ câu cũ nhất. */
export function addFavorite(list: string[], template: string): string[] {
  const next = [template, ...list.filter((t) => t !== template)].slice(0, MAX_FAVORITES);
  write(next);
  return next;
}

export function removeFavorite(list: string[], template: string): string[] {
  const next = list.filter((t) => t !== template);
  write(next);
  return next;
}
