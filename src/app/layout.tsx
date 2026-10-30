import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Plus_Jakarta_Sans } from "next/font/google";
import { APP_NAME, APP_SHORT_NAME, BRAND_COLOR } from "@/config/constants";
import { NetworkStatus } from "@/components/shared/network-status";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { MonitoringListener } from "@/components/shared/monitoring-listener";
import { ConfirmSheetHost } from "@/components/ui/confirm-sheet";
import { Toaster } from "@/components/ui/toast";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/pwa/capture";
import "./globals.css";

// Plus Jakarta Sans: nét tròn, thân thiện, rõ ràng trên màn hình nhỏ; đủ dấu tiếng Việt. 400–800 cho phân cấp tiêu đề.
const font = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

const DESCRIPTION = "Sổ liên lạc thông minh — kết nối nhà trường và phụ huynh.";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_SHORT_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  // manifest.webmanifest được Next.js tự gắn từ src/app/manifest.ts
  appleWebApp: {
    capable: true,
    title: APP_SHORT_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS < 16.4 không đọc manifest: cần thẻ này để mở toàn màn hình từ icon Màn hình chính
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false }, // ứng dụng nội bộ, chứa dữ liệu trẻ em
  openGraph: { title: APP_NAME, description: DESCRIPTION, siteName: APP_NAME, locale: "vi_VN", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // để env(safe-area-inset-*) hoạt động trên iPhone có tai thỏ / Dynamic Island
  themeColor: BRAND_COLOR,
  colorScheme: "light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CSP theo nonce (middleware): mỗi lượt tải cần HTML mới mang đúng nonce → không prerender trang tĩnh lúc build
  // (trang tĩnh dựng sẵn không có nonce → script bị trình duyệt chặn).
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="vi" className={font.variable}>
      <head>
        {/* Bắt sự kiện cài PWA NGAY khi trang tải (Chrome có thể bắn trước khi React chạy) → usePWAInstall() dùng lại.
            suppressHydrationWarning: trình duyệt tự xoá giá trị thuộc tính nonce sau khi đọc (chống lộ nonce)
            → HTML thấy nonce="" khác giá trị server gửi; script vẫn chạy đúng, chỉ bỏ cảnh báo lệch hydrate. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className={font.className}>
        {children}
        <NetworkStatus />
        <ServiceWorkerRegister />
        {/* Ghi nhận lỗi JS không được xử lý → /admin/system (+ Sentry nếu cấu hình) */}
        <MonitoringListener />
        {/* Hộp xác nhận dạng Bottom Sheet dùng chung (confirmSheet) */}
        <ConfirmSheetHost />
        {/* Toast góc trên (thành công / lỗi) dùng chung */}
        <Toaster />
      </body>
    </html>
  );
}
