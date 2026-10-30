// Content Security Policy theo nonce (mỗi lượt tải trang 1 nonce ngẫu nhiên) — middleware gắn vào mọi trang.
// Next.js tự gắn nonce cho script của nó khi thấy header CSP trên request. Module thuần, chạy được trên Edge.

/** Nonce base64 128-bit (Web Crypto — có sẵn trên Edge runtime). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

type CspOptions = {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL — REST, Storage (ảnh / video / upload resumable), Realtime (wss) */
  supabaseUrl?: string;
  /** next dev: React Refresh cần eval + WebSocket HMR */
  dev?: boolean;
  /** Bản preview trên Vercel: cho phép thanh công cụ vercel.live */
  vercelPreview?: boolean;
};

export function buildCsp({ nonce, supabaseUrl, dev = false, vercelPreview = false }: CspOptions): string {
  let supabase = "";
  let supabaseWs = "";
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl);
      supabase = u.origin;
      supabaseWs = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    }
  } catch {
    // URL sai → bỏ qua (app sẽ báo lỗi cấu hình ở chỗ khác)
  }
  const vercel = vercelPreview ? "https://vercel.live" : "";
  let mapTiles = "";
  try {
    if (process.env.NEXT_PUBLIC_MAP_TILE_URL) mapTiles = new URL(process.env.NEXT_PUBLIC_MAP_TILE_URL.replace(/{[a-z]}/g, "a")).origin;
  } catch {
    // URL sai → bỏ qua
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic': script được nạp từ script có nonce cũng chạy được (chunk của Next.js);
    // https: / 'unsafe-inline' chỉ là dự phòng cho trình duyệt rất cũ — trình duyệt hỗ trợ nonce sẽ BỎ QUA chúng.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https:", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), vercel],
    // Tailwind được nhúng thẳng vào <style> (inlineCss) + thuộc tính style={...} của React → cần 'unsafe-inline' cho style
    // (rủi ro thấp: CSS không chạy được mã).
    "style-src": ["'self'", "'unsafe-inline'", vercel],
    // data: mã QR chuyển khoản, blob: ảnh xem trước khi tải lên, Supabase: ảnh / video ký URL
    // Ảnh nền bản đồ cơ sở (src/features/campuses/components/campus-map.tsx): OSM + Esri dự phòng + nguồn tuỳ chọn
    "img-src": ["'self'", "data:", "blob:", supabase, "https://tile.openstreetmap.de", "https://server.arcgisonline.com", mapTiles, vercel],
    "media-src": ["'self'", "blob:", supabase],
    "font-src": ["'self'", "data:", vercel],
    "connect-src": ["'self'", supabase, supabaseWs, ...(dev ? ["ws:", "wss:"] : []), vercel],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": [vercel || "'none'"],
    // Chống clickjacking (thay thế hiện đại của X-Frame-Options)
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // Vi phạm CSP gửi về nhật ký lỗi (/admin/system) để phát hiện sớm nếu chặn nhầm tính năng
    "report-uri": ["/api/csp-report"],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.filter(Boolean).join(" ")}`)
    .join("; ");
  return dev ? policy : `${policy}; upgrade-insecure-requests`;
}
