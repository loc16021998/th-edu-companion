"use client";

// Tiện ích upload phía trình duyệt: kiểm tra file, nén ảnh, tạo đường dẫn, dịch lỗi Storage.
import { compressImage } from "@/lib/images/compress";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // sau khi nén
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // = giới hạn của bucket

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/3gpp": "3gp",
};
const ALLOWED_EXT = new Set(Object.values(EXT_BY_TYPE));

export function mediaKind(file: Blob): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/** Đuôi file theo MIME; một số máy Android/Windows để trống MIME → đoán theo tên file. */
export function extensionFor(file: File | Blob, name?: string): string | null {
  const byType = EXT_BY_TYPE[file.type];
  if (byType) return byType;
  const fromName = name?.split(".").pop()?.toLowerCase();
  return fromName && ALLOWED_EXT.has(fromName) ? (fromName === "jpeg" ? "jpg" : fromName) : null;
}

/** Trả về thông báo lỗi tiếng Việt nếu file không hợp lệ, ngược lại null. */
export function validateFile(file: File): string | null {
  const kind = mediaKind(file) ?? (extensionFor(file, file.name) ? "image" : null);
  if (!kind || !extensionFor(file, file.name)) return `"${file.name}" không phải ảnh/video được hỗ trợ.`;
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) return `Video "${file.name}" vượt quá 50MB.`;
  // Ảnh lớn sẽ được nén; chỉ chặn ảnh cực lớn không thể xử lý
  if (kind === "image" && file.size > 40 * 1024 * 1024) return `Ảnh "${file.name}" quá lớn (tối đa 40MB).`;
  return null;
}

/**
 * Nén ảnh trước khi tải lên: < 400KB, giữ chất lượng JPEG cao và hạ dần độ phân giải, bỏ EXIF (xem lib/images/compress).
 * Ảnh điện thoại 3–10MB còn dưới 400KB mà chữ viết của bé vẫn đọc rõ.
 */
export function prepareImage(file: File): Promise<Blob> {
  return compressImage(file);
}

/** {student_id}/{date}/{timestamp}-{random}.{ext} — thư mục đầu tiên quyết định quyền (storage RLS). */
export function buildMediaPath(studentId: string, date: string, ext: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${studentId}/${date}/${Date.now()}-${rand}.${ext}`;
}

export const NETWORK_UPLOAD_ERROR = "Mất kết nối mạng khi tải lên.";

export function storageErrorMessage(error: { message?: string; statusCode?: string | number }): string {
  const msg = error.message ?? "";
  if (/row-level security|unauthorized|not authorized|403/i.test(msg) || String(error.statusCode) === "403") {
    return "Bạn không có quyền tải ảnh cho học sinh này.";
  }
  if (/maximum allowed size|too large|413/i.test(msg) || String(error.statusCode) === "413") return "File quá lớn (tối đa 50MB).";
  if (/mime type|not supported/i.test(msg)) return "Định dạng file không được hỗ trợ.";
  if (/fetch|network/i.test(msg)) return NETWORK_UPLOAD_ERROR;
  return "Tải lên thất bại. Vui lòng thử lại.";
}
