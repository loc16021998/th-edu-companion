import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, createNonce } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  // CSP theo nonce: đặt trên REQUEST để Next.js gắn nonce cho script của nó khi render, và trên RESPONSE để trình duyệt áp dụng
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
    vercelPreview: process.env.VERCEL_ENV === "preview",
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Bỏ qua tài nguyên tĩnh + file PWA (manifest, service worker, trang offline) — không cần session
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
