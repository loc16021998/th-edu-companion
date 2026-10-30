import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

export default function config(phase: string): NextConfig {
  return {
    // Tách thư mục build của `next dev` và `next build`: nếu dùng chung `.next`, chạy song song
    // sẽ ghi đè manifest của nhau → lỗi "Server Action ... was not found on the server".
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    poweredByHeader: false,
    // Metadata (title, description) luôn nằm trong <head> — metadata của app là tĩnh nên không cần stream
    // (trình chia sẻ link, công cụ đo SEO đọc được ngay).
    htmlLimitedBots: /.*/,
    webpack(webpackConfig) {
      // Ẩn gợi ý hiệu năng nội bộ của bộ đệm webpack ("Serializing big strings...") khi build lạnh
      // trên CI — không liên quan code ứng dụng. Lỗi thật vẫn được in ra.
      webpackConfig.infrastructureLogging = { ...webpackConfig.infrastructureLogging, level: "error" };
      return webpackConfig;
    },
    async headers() {
      return [
        {
          // Service worker luôn phải lấy bản mới nhất, nếu không người dùng kẹt ở phiên bản cũ
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
            { key: "Content-Type", value: "application/javascript; charset=utf-8" },
            { key: "Service-Worker-Allowed", value: "/" },
          ],
        },
        {
          // Logo / ảnh nền tĩnh: cache lâu trên máy (đổi ảnh → đổi tên file)
          source: "/brand/:path*",
          headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }],
        },
        {
          source: "/icons/:path*",
          headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
        },
        {
          source: "/:path*",
          // Content-Security-Policy (theo nonce, đổi mỗi lượt tải) do middleware gắn — xem src/lib/security/csp.ts
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            // Chống clickjacking cho trình duyệt cũ (trình duyệt mới dùng CSP frame-ancestors 'none')
            { key: "X-Frame-Options", value: "DENY" },
            // Bắt buộc HTTPS 2 năm (trình duyệt bỏ qua header này khi truy cập qua http://localhost)
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
            // Tab do app mở (link Zalo, ngân hàng) không truy cập ngược được window của app
            { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
            { key: "X-DNS-Prefetch-Control", value: "on" },
            // microphone=(self): cô ghi lời nhắn thoại khi chấm bài (MediaRecorder); geolocation=(self): "Cơ sở nào gần nhà tôi?"
            { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          ],
        },
      ];
    },
    experimental: {
      // Bộ nhớ đệm phía trình duyệt khi chuyển tab qua lại: trang động dùng lại 30s, trang tĩnh 3 phút
      // (thao tác lưu gọi revalidatePath → tự làm mới ngay) → bấm qua lại các tab không gọi lại server/DB.
      staleTimes: { dynamic: 30, static: 180 },
      optimizePackageImports: ["recharts"],
      // Nhúng CSS (Tailwind, ~10KB gzip) thẳng vào HTML → không còn request CSS chặn hiển thị
      inlineCss: true,
    },
    images: {
      // Ảnh Supabase qua bộ tối ưu: AVIF/WebP, đúng kích thước ô hiển thị (thumbnail nhẹ hơn ảnh gốc nhiều lần)
      formats: ["image/avif", "image/webp"],
      deviceSizes: [360, 414, 640, 768, 1080, 1280, 1920],
      imageSizes: [48, 64, 96, 128, 160, 256, 320, 420],
      minimumCacheTTL: 3600,
      remotePatterns: supabaseHost
        ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/**" }]
        : [],
    },
  };
}
