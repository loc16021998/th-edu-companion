import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME, BRAND_COLOR } from "@/config/constants";

/** Web App Manifest → /manifest.webmanifest (cho phép "Thêm vào Màn hình chính" trên Android/iOS). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Sổ liên lạc thông minh — kết nối nhà trường và phụ huynh.",
    lang: "vi",
    dir: "ltr",
    // App cài trên điện thoại (phụ huynh/giáo viên) mở thẳng trang đăng nhập của họ, không qua trang quản trị.
    // Đã đăng nhập → middleware tự chuyển về trang chủ theo vai trò.
    start_url: "/login?source=pwa", // trang chọn phụ huynh / giáo viên
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: BRAND_COLOR,
    categories: ["education", "productivity"],
    prefer_related_applications: false,
    // Nhấn giữ biểu tượng app → lối tắt
    shortcuts: [
      { name: "Bản tin", short_name: "Bản tin", url: "/parent/notifications?source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Nhắn tin với cô", short_name: "Nhắn tin", url: "/chat?source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Xin nghỉ học", short_name: "Xin nghỉ", url: "/parent/leave-request?source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
