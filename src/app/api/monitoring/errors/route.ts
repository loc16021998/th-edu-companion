import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/features/auth/queries";
import { captureError } from "@/lib/monitoring/server";
import { ERROR_CATEGORIES } from "@/lib/monitoring/shared";
import { ipFromHeaders, rateLimit } from "@/lib/security/rate-limit";

/** Báo lỗi từ trình duyệt (lib/monitoring/client.ts). Không cần đăng nhập — lỗi trang đăng nhập cũng cần ghi. */
const MAX_BYTES = 16 * 1024;

const reportSchema = z.object({
  message: z.string().min(1).max(2000),
  name: z.string().max(200).optional(),
  stack: z.string().max(10_000).optional(),
  digest: z.string().max(100).optional(),
  category: z.enum(ERROR_CATEGORIES).optional(),
  level: z.enum(["error", "warning"]).optional(),
  url: z.string().max(2000).optional(),
  online: z.boolean().optional(),
  context: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const limit = await rateLimit("clientError", ipFromHeaders(request.headers));
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  const r = parsed.data;

  // Người dùng (nếu đang đăng nhập) — chỉ id + vai trò, không email / SĐT
  const ctx = await getAuthContext().catch(() => null);
  const error = Object.assign(new Error(r.message), { name: r.name ?? "Error", stack: r.stack });
  const id = await captureError({
    error,
    source: "client",
    level: r.level ?? "error",
    category: r.category,
    digest: r.digest ?? null,
    path: r.url ?? null,
    userId: ctx?.profile.id ?? null,
    userRole: ctx?.profile.role ?? null,
    userAgent: request.headers.get("user-agent"),
    context: { ...r.context, online: r.online ?? null },
  });
  return NextResponse.json({ ok: true, id }, { headers: { "Cache-Control": "no-store" } });
}
