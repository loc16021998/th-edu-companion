// Giám sát lỗi — phần dùng chung client + server (thuần, không phụ thuộc môi trường).

export const ERROR_CATEGORIES = ["network", "supabase", "upload", "auth", "render", "chunk", "unknown"] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export const ERROR_AREAS = ["parent", "teacher", "admin", "auth", "public", "api"] as const;
export type ErrorArea = (typeof ERROR_AREAS)[number];

export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network: "Mất mạng / kết nối",
  supabase: "Truy vấn Supabase",
  upload: "Tải ảnh / video",
  auth: "Đăng nhập / phiên",
  render: "Lỗi hiển thị trang",
  chunk: "Phiên bản app cũ",
  unknown: "Khác",
};

/** Khu vực theo đường dẫn: /parent/... → parent. */
export function areaOf(path: string | null | undefined): ErrorArea {
  if (!path) return "public";
  if (path.startsWith("/api/")) return "api";
  if (path.startsWith("/admin/login") || path.startsWith("/login")) return "auth";
  if (path.startsWith("/parent")) return "parent";
  if (path.startsWith("/teacher")) return "teacher";
  if (path.startsWith("/admin")) return "admin";
  return "public";
}

/** Phân loại theo tên / nội dung lỗi (đủ để lọc trên trang giám sát). */
export function categorize(name: string | undefined, message: string, hint?: ErrorCategory): ErrorCategory {
  if (hint) return hint;
  const m = `${name ?? ""} ${message}`;
  if (/ChunkLoadError|Loading chunk|Failed to find Server Action|dynamically imported module/i.test(m)) return "chunk";
  if (/Failed to fetch|NetworkError|Load failed|ERR_NETWORK|ECONNRESET|ETIMEDOUT|fetch failed|network|timeout|offline/i.test(m)) return "network";
  if (/PGRST\d+|postgres|PostgrestError|supabase|violates|relation .* does not exist|JWT/i.test(m)) return "supabase";
  if (/upload|tus|storage|bucket|payload too large|413/i.test(m)) return "upload";
  if (/auth|session|refresh token|not authenticated|401|403/i.test(m)) return "auth";
  return "unknown";
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<!\d)(?:\+?84|0)\d{9,10}(?!\d)/g;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const SECRETISH = /\b(?:sk|pk|key|token|secret|apikey|password)=([^\s&"']+)/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Che email, SĐT, token trước khi lưu / gửi ra ngoài. */
export function scrub(text: string | null | undefined, max = 1000): string {
  if (!text) return "";
  return text.replace(JWT, "[token]").replace(SECRETISH, "[secret]").replace(EMAIL, "[email]").replace(PHONE, "[sđt]").slice(0, max);
}

/** Đường dẫn không kèm query string (có thể chứa id bé, token ký ảnh…). */
export function cleanPath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://x").pathname.slice(0, 300);
  } catch {
    return url.split("?")[0]!.slice(0, 300);
  }
}

/**
 * Dấu vân tay để gom lỗi giống nhau: loại + thông điệp đã bỏ số/uuid + dòng stack đầu (bỏ số dòng/cột).
 * Cùng 1 lỗi xảy ra ở 50 máy → 1 nhóm, đếm 50 lần.
 */
export function fingerprintOf(category: string, message: string, stack?: string | null): string {
  const norm = message.replace(UUID, "<id>").replace(/\d+/g, "<n>").slice(0, 200);
  const frame =
    stack
      ?.split("\n")
      .find((l) => /\bat\b|@/.test(l))
      ?.replace(/:\d+:\d+/g, "")
      .replace(/\?[^)\s]*/g, "")
      .trim()
      .slice(0, 160) ?? "";
  const raw = `${category}|${norm}|${frame}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `${category}-${(h >>> 0).toString(36)}`;
}

/** Lỗi không cần ghi: tiện ích trình duyệt, huỷ yêu cầu, lỗi vô hại của ResizeObserver… */
export function isNoise(message: string, stack?: string | null): boolean {
  if (/ResizeObserver loop|AbortError|The user aborted|NEXT_REDIRECT|NEXT_NOT_FOUND|Script error\.?$/i.test(message)) return true;
  return /chrome-extension:|moz-extension:|safari-extension:/i.test(stack ?? "");
}

/** Lỗi gửi từ trình duyệt lên /api/monitoring/errors. */
export type ClientErrorReport = {
  message: string;
  name?: string;
  stack?: string;
  digest?: string;
  category?: ErrorCategory;
  level?: "error" | "warning";
  url?: string;
  online?: boolean;
  context?: Record<string, string | number | boolean | null>;
};
