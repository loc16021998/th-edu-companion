import "server-only";
import { MEDIA_BUCKET } from "@/config/constants";
import { createClient } from "@/lib/supabase/server";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp)$/i;

/** `path`: đường dẫn gốc trong bucket (hoặc URL ngoài) — dùng làm khoá khi sửa sổ liên lạc. */
export type MediaItem = { url: string; type: "image" | "video"; name: string; path: string };

function toItem(pathOrUrl: string, url: string): MediaItem {
  const clean = pathOrUrl.split("?")[0] ?? pathOrUrl;
  return {
    url,
    type: VIDEO_EXT.test(clean) ? "video" : "image",
    name: clean.split("/").pop() ?? clean,
    path: pathOrUrl,
  };
}

/**
 * Chuyển media_urls (đường dẫn trong bucket private, hoặc URL đầy đủ) thành URL xem được.
 * Signed URL được tạo bằng session của người dùng → storage RLS quyết định ai xem được ảnh nào.
 * File lỗi/không tồn tại bị bỏ qua thay vì làm hỏng cả trang.
 */
export async function resolveMediaUrls(paths: string[], expiresIn = 60 * 60, bucket: string = MEDIA_BUCKET): Promise<MediaItem[]> {
  if (paths.length === 0) return [];

  const storagePaths = paths.filter((p) => !/^https?:\/\//i.test(p));
  const signed = new Map<string, string>();

  if (storagePaths.length > 0) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(storagePaths, expiresIn);
      if (error) throw error;
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
      }
    } catch (err) {
      console.error("[media] Không tạo được signed URL:", err);
    }
  }

  return paths.flatMap((p) => {
    if (/^https?:\/\//i.test(p)) return [toItem(p, p)];
    const url = signed.get(p);
    return url ? [toItem(p, url)] : [];
  });
}
