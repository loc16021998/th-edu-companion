"use client";

import Image, { type ImageProps } from "next/image";

/** Placeholder mờ (shimmer xám nhạt) hiển thị trong lúc ảnh đang tải — tránh khoảng trắng / nhảy bố cục. */
export const BLUR_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeDI9IjEiIHkxPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZTJlOGYwIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZjFmNWY5Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+";

const SUPABASE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
  } catch {
    return null;
  }
})();

/** Ảnh từ Supabase Storage → qua bộ tối ưu Next (WebP/AVIF, đúng kích thước theo `sizes`); blob:/data: (xem trước) → hiển thị thẳng. */
function shouldOptimize(src: string) {
  if (!SUPABASE_HOST) return false;
  try {
    const url = new URL(src);
    return url.host === SUPABASE_HOST && url.pathname.startsWith("/storage/v1/");
  } catch {
    return false;
  }
}

/**
 * next/image cho ảnh người dùng (gallery, chat, bài tập…): lazy loading mặc định, placeholder mờ,
 * `sizes` bắt buộc để trình duyệt chỉ tải bản vừa đủ cho ô hiển thị.
 */
export function MediaImage({ src, alt, sizes, ...rest }: Omit<ImageProps, "src" | "placeholder" | "blurDataURL"> & { src: string; sizes: string }) {
  return <Image src={src} alt={alt} sizes={sizes} placeholder="blur" blurDataURL={BLUR_PLACEHOLDER} unoptimized={!shouldOptimize(src)} {...rest} />;
}
