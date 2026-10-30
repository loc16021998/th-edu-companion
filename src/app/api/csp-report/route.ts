import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/monitoring/server";
import { ipFromHeaders, rateLimit } from "@/lib/security/rate-limit";

/**
 * Trình duyệt gửi báo cáo khi Content Security Policy chặn 1 tài nguyên (directive report-uri trong lib/security/csp.ts).
 * Ghi vào nhật ký lỗi (cảnh báo) → thấy ngay ở Admin → Giám sát hệ thống nếu CSP chặn nhầm tính năng sau khi deploy.
 */
const MAX_BYTES = 8 * 1024;

type CspReport = {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "source-file"?: string;
  "line-number"?: number;
};

/** Chỉ giữ origin của tài nguyên bị chặn (URL đầy đủ có thể chứa token ký). */
function originOf(uri: string | undefined) {
  if (!uri) return "unknown";
  try {
    return new URL(uri).origin;
  } catch {
    return uri.slice(0, 40); // "inline", "eval", "data"…
  }
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return new NextResponse(null, { status: 413 });
  const limit = await rateLimit("clientError", ipFromHeaders(request.headers));
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  let report: CspReport | undefined;
  try {
    const body = JSON.parse((await request.text()).slice(0, MAX_BYTES)) as { "csp-report"?: CspReport };
    report = body["csp-report"];
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!report) return new NextResponse(null, { status: 400 });

  const blocked = originOf(report["blocked-uri"]);
  // Tiện ích mở rộng của trình duyệt chèn script / style → không phải lỗi của app
  if (/^(chrome|moz|safari)-extension/.test(blocked) || /extension/.test(report["source-file"] ?? "")) return new NextResponse(null, { status: 204 });

  const directive = report["effective-directive"] ?? report["violated-directive"]?.split(" ")[0] ?? "unknown";
  await captureError({
    error: new Error(`CSP chặn ${directive} ← ${blocked}`),
    source: "client",
    level: "warning",
    category: "unknown",
    path: report["document-uri"] ?? null,
    userAgent: request.headers.get("user-agent"),
    context: { directive, blocked, sourceFile: originOf(report["source-file"]), line: report["line-number"] ?? null },
  });
  return new NextResponse(null, { status: 204 });
}
