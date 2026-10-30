"use client";

import { DetailedError, Upload } from "tus-js-client";
import { MEDIA_BUCKET } from "@/config/constants";
import { env } from "@/lib/env";
import { NETWORK_UPLOAD_ERROR, storageErrorMessage } from "./upload";

/** Supabase yêu cầu chunk đúng 6MB cho upload resumable. */
const CHUNK_SIZE = 6 * 1024 * 1024;
/** Mạng di động chập chờn: tự thử lại với độ trễ tăng dần trước khi báo lỗi. */
const RETRY_DELAYS = [0, 2_000, 5_000, 10_000, 20_000];

export type ResumableUpload = {
  /** Bắt đầu, hoặc TIẾP TỤC từ byte đã tải (sau lỗi / mất mạng) — không tải lại từ đầu. */
  start: () => void;
  /** Dừng tạm (giữ phần đã tải); `discard` = huỷ hẳn và xoá phần đã tải trên server. */
  abort: (discard?: boolean) => Promise<void>;
};

/**
 * Upload resumable (giao thức TUS) lên Supabase Storage — chia chunk 6MB, báo tiến trình,
 * tự thử lại và nối tiếp khi mạng yếu. Dùng session của giáo viên → storage RLS vẫn kiểm tra quyền.
 */
export function createResumableUpload({
  blob,
  path,
  contentType,
  accessToken,
  onProgress,
  onSuccess,
  onError,
  bucket = MEDIA_BUCKET,
}: {
  /** Kho lưu trữ đích (mặc định: ảnh hoạt động của sổ liên lạc) */
  bucket?: string;
  blob: Blob;
  path: string;
  contentType: string;
  accessToken: string;
  onProgress: (percent: number) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}): ResumableUpload {
  const upload = new Upload(blob, {
    endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`,
    retryDelays: RETRY_DELAYS,
    chunkSize: CHUNK_SIZE,
    uploadDataDuringCreation: true, // file nhỏ (ảnh đã nén) chỉ cần 1 request
    removeFingerprintOnSuccess: true,
    // Mỗi lần chọn file sinh đường dẫn mới → không nối tiếp upload của phiên trước (sai đường dẫn)
    storeFingerprintForResuming: false,
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: env.supabaseAnonKey,
      "x-upsert": "false",
    },
    metadata: {
      bucketName: bucket,
      objectName: path,
      contentType,
      cacheControl: "3600",
    },
    onShouldRetry: (error) => {
      const status = error.originalResponse?.getStatus() ?? 0;
      // Lỗi quyền / file không hợp lệ: thử lại vô ích. Lỗi mạng (status 0), 409 khoá tạm, 429, 5xx: thử lại.
      return status === 0 || status === 409 || status === 429 || status >= 500;
    },
    onProgress: (sent, total) => onProgress(total > 0 ? Math.round((sent / total) * 100) : 0),
    onSuccess: () => onSuccess(),
    onError: (error) => onError(tusErrorMessage(error)),
  });

  return {
    start: () => upload.start(),
    abort: (discard = false) => upload.abort(discard).catch(() => undefined),
  };
}

function tusErrorMessage(error: Error | DetailedError): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return NETWORK_UPLOAD_ERROR;
  if (error instanceof DetailedError) {
    // Không có response = request không tới được server (mất mạng, timeout, bị chặn)
    if (!error.originalResponse) return NETWORK_UPLOAD_ERROR;
    const status = error.originalResponse.getStatus();
    let body = "";
    try {
      body = error.originalResponse.getBody();
    } catch {
      // body không đọc được — chỉ dùng status
    }
    if (status === 0) return NETWORK_UPLOAD_ERROR;
    return storageErrorMessage({ message: body, statusCode: status });
  }
  return storageErrorMessage({ message: error.message });
}
