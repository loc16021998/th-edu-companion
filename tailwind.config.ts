import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        // Plus Jakarta Sans (next/font, có bộ tiếng Việt) — biến --font-sans gắn ở layout gốc
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      /*
       * THANG CỠ CHỮ — chữ nhỏ nhất 14px cho phụ huynh lớn tuổi dễ đọc trên điện thoại.
       * xs 14/20 (chú thích, ngày tháng) · sm 15/22 (nội dung phụ) · base 16/24 (nội dung chính) · lg 18 · xl 20 (tiêu đề trang) · 2xl 24.
       * Phân cấp bằng độ đậm: medium (nội dung) → semibold (nhãn, ngày tháng) → bold / extrabold (tên bé, tiêu đề).
       */
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
      },
      // Bóng đổ mềm, ánh xanh thương hiệu → thẻ "nổi khối" nhẹ nhàng trên nền #F8FAFC
      boxShadow: {
        sm: "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 8px -2px rgba(30, 79, 176, 0.08)",
        DEFAULT: "0 1px 3px rgba(15, 23, 42, 0.05), 0 4px 12px -4px rgba(30, 79, 176, 0.10)",
        md: "0 2px 4px rgba(15, 23, 42, 0.04), 0 8px 20px -6px rgba(30, 79, 176, 0.14)",
        lg: "0 4px 8px rgba(15, 23, 42, 0.04), 0 16px 32px -10px rgba(30, 79, 176, 0.18)",
        // Điểm nhấn neumorphic: nổi khỏi nền (sáng góc trên trái, bóng góc dưới phải)
        neu: "6px 6px 16px rgba(148, 163, 184, 0.22), -6px -6px 16px rgba(255, 255, 255, 0.95)",
      },
      colors: {
        // Bảng màu thương hiệu TH EDU (dùng cho điểm nhấn; thành phần chung dùng token primary / muted… bên dưới)
        edu: {
          blue: { 50: "#EFF4FF", 100: "#DCE6FD", 200: "#BFD1FB", 300: "#93B2F7", 500: "#2F63D6", DEFAULT: "#1E4FB0", 700: "#1A4396", 800: "#173775" },
          navy: "#0F1E46",
          // Xanh lá non — sự phát triển của trẻ (Tiền tiểu học)
          leaf: { 50: "#F7FEE7", 100: "#ECFCCB", 200: "#D9F99D", 300: "#BEF264", DEFAULT: "#84CC16", 700: "#4D7C0F", 800: "#365314" },
          // Cam pastel — năng động (Toán tư duy)
          peach: { 50: "#FFF7ED", 100: "#FFEDD5", 200: "#FED7AA", 300: "#FDBA74", DEFAULT: "#F97316", 800: "#9A3412" },
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      keyframes: {
        "bell-ring": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(14deg)" },
          "40%": { transform: "rotate(-12deg)" },
          "60%": { transform: "rotate(8deg)" },
          "80%": { transform: "rotate(-4deg)" },
        },
        // Vệt sáng chạy ngang trên Skeleton khi đang tải
        shimmer: { "100%": { transform: "translateX(100%)" } },
        // Chuyển trang: hiện dần + trượt nhẹ lên. Kết thúc ở transform: none (không để lại containing block cho phần tử fixed)
        "page-in": { from: { opacity: "0.4", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "toast-in": { from: { opacity: "0", transform: "translateY(-16px) scale(0.96)" }, to: { opacity: "1", transform: "none" } },
        "toast-out": { to: { opacity: "0", transform: "translateY(-12px) scale(0.96)" } },
        "toast-icon": { "0%": { transform: "scale(0.4)" }, "60%": { transform: "scale(1.15)" }, "100%": { transform: "scale(1)" } },
        "check-draw": { to: { strokeDashoffset: "0" } },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-4px)" },
          "40%, 80%": { transform: "translateX(4px)" },
        },
        // Thả tim: phồng lên rồi bật về
        "heart-pop": { "0%": { transform: "scale(1)" }, "30%": { transform: "scale(1.45)" }, "55%": { transform: "scale(0.9)" }, "80%": { transform: "scale(1.1)" }, "100%": { transform: "scale(1)" } },
        // Nút "Nộp bài" / gửi thành công: nảy vui nhộn
        "bounce-in": { "0%": { transform: "scale(1)" }, "30%": { transform: "scale(0.92)" }, "55%": { transform: "scale(1.06)" }, "75%": { transform: "scale(0.98)" }, "100%": { transform: "scale(1)" } },
        // Vòng lan toả quanh tim khi thả
        "ping-once": { "0%": { transform: "scale(0.6)", opacity: "0.7" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
      },
      animation: {
        "bell-ring": "bell-ring 0.6s ease-in-out 2",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "page-in": "page-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "toast-in": "toast-in 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        "toast-out": "toast-out 0.2s ease-in forwards",
        "toast-icon": "toast-icon 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "check-draw": "check-draw 0.35s 0.18s ease-out forwards",
        shake: "shake 0.4s ease-in-out",
        "heart-pop": "heart-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "bounce-in": "bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ping-once": "ping-once 0.6s ease-out forwards",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
};

export default config;
