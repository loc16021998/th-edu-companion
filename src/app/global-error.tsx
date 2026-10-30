"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/client";

/**
 * Lỗi ở chính root layout (không còn layout/CSS bao ngoài) → tự render <html>, style inline.
 * Hiếm khi xảy ra; giữ tối giản để chắc chắn hiển thị được.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportError(error, { level: "error", category: "render", digest: error.digest, context: { boundary: "global" } });
  }, [error]);

  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 360 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image không dùng được khi root layout lỗi */}
          <img src="/icons/icon-192.png" alt="TH EDU" width={72} height={72} style={{ borderRadius: 18 }} />
          <h1 style={{ fontSize: 20, margin: "20px 0 8px" }}>Đã có lỗi xảy ra</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
            TH EDU Companion gặp sự cố khi tải. Vui lòng thử lại sau giây lát.
          </p>
          {/* Mã lỗi chỉ dành cho bộ phận hỗ trợ — thu gọn */}
          {error.digest && (
            <details style={{ marginTop: 12, fontSize: 14, color: "#64748b" }}>
              <summary style={{ cursor: "pointer" }}>Thông tin cho bộ phận hỗ trợ</summary>
              <code>{error.digest}</code>
            </details>
          )}
          <button
            type="button"
            // Layout gốc đã lỗi → tải lại toàn trang chắc chắn hơn reset()
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24,
              height: 48,
              padding: "0 28px",
              border: 0,
              borderRadius: 12,
              background: "#1E4FB0",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
