import { ORGANIZATION } from "@/config/constants";

/**
 * Chat Zalo với trung tâm: zalo.me/<số điện thoại OA/hotline>.
 * Máy tính chưa đăng nhập Zalo → Zalo hiện trang đăng nhập rồi mở khung chat; điện thoại → mở app Zalo.
 */
export const ZALO_URL = `https://zalo.me/${(ORGANIZATION.phones[0]?.tel ?? "").replace(/^\+84/, "0")}`;

/** Biểu tượng chữ "Zalo" đơn giản (không dùng logo thương hiệu). */
export function ZaloIcon({ className, textColor = "#fff" }: { className?: string; /** màu chữ "Zalo" bên trong bong bóng */ textColor?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.62 1.3 4.97 3.37 6.58-.13.98-.6 2.36-1.77 3.48 0 0 2.62.08 4.62-1.6 1.17.36 2.44.55 3.78.55 5.52 0 10-3.94 10-8.8S17.52 2 12 2Z" />
      <text x="12" y="13.6" textAnchor="middle" fontSize="6.4" fontWeight="800" fill={textColor} fontFamily="Arial, sans-serif">
        Zalo
      </text>
    </svg>
  );
}
