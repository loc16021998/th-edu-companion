// Kiểm tra cấu hình biến môi trường & rò rỉ bí mật. KHÔNG in giá trị khoá — chỉ in tên biến + kết quả.
//   node scripts/check-env.mjs                → kiểm tra cấu hình (chạy tự động trước `npm run build`)
//   node scripts/check-env.mjs --scan-build   → dò giá trị bí mật trong JS gửi xuống trình duyệt (.next/static) — chạy sau build
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Đọc .env.local khi chạy tay trên máy; trên Vercel biến đã có sẵn trong process.env
for (const f of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
}

const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
const errors = [];
const warnings = [];
const ok = [];

/** Biến chỉ được nằm ở server — tuyệt đối không được có tiền tố NEXT_PUBLIC_. */
const SERVER_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "PUSH_DISPATCH_SECRET",
  "PAYMENT_WEBHOOK_SECRET",
  "CRON_SECRET",
  "HEALTH_CHECK_SECRET",
  "MESSAGING_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "SENTRY_DSN",
  "RESEND_API_KEY",
];
/** Biến công khai được phép (giá trị nằm trong JS của trình duyệt). */
const PUBLIC_ALLOWED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "NEXT_PUBLIC_APP_VERSION", "NEXT_PUBLIC_MONITORING_ENABLED", "NEXT_PUBLIC_MAP_TILE_URL", "NEXT_PUBLIC_APP_URL"];

// 1. Không biến NEXT_PUBLIC_ nào mang tên kiểu bí mật / không nằm trong danh sách cho phép
for (const name of Object.keys(process.env).filter((n) => n.startsWith("NEXT_PUBLIC_"))) {
  if (/SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|DSN/i.test(name)) errors.push(`${name}: tên có dạng bí mật nhưng có tiền tố NEXT_PUBLIC_ → sẽ bị nhúng vào JS trình duyệt. Bỏ tiền tố.`);
  else if (!PUBLIC_ALLOWED.includes(name)) warnings.push(`${name}: biến công khai chưa có trong danh sách cho phép (scripts/check-env.mjs) — chắc chắn không phải bí mật?`);
}

// 2. Biến bắt buộc
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) if (!process.env[name]) errors.push(`Thiếu ${name}`);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) (isProd ? errors : warnings).push("Thiếu SUPABASE_SERVICE_ROLE_KEY (tạo tài khoản, gửi push, nhật ký lỗi)");

// 3. URL Supabase dùng HTTPS ở production
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (url && isProd && !url.startsWith("https://")) errors.push("NEXT_PUBLIC_SUPABASE_URL phải dùng https:// ở production");

// 4. Vai trò của khoá Supabase (đọc claim "role" trong JWT, hoặc tiền tố khoá mới sb_publishable_ / sb_secret_)
function keyRole(key) {
  if (!key) return null;
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";
  try {
    return JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")).role ?? "?";
  } catch {
    return "?";
  }
}
const anonRole = keyRole(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const serviceRole = keyRole(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (anonRole && anonRole !== "anon") errors.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY có vai trò "${anonRole}" — khoá công khai PHẢI là anon/publishable. Đổi khoá ngay nếu đây là service_role!`);
else if (anonRole) ok.push("NEXT_PUBLIC_SUPABASE_ANON_KEY là khoá anon (công khai được, dữ liệu do RLS bảo vệ)");
if (serviceRole && serviceRole !== "service_role") errors.push(`SUPABASE_SERVICE_ROLE_KEY có vai trò "${serviceRole}" — cần khoá service_role / secret`);
else if (serviceRole) ok.push("SUPABASE_SERVICE_ROLE_KEY là khoá service_role, chỉ dùng ở server");

// 5. Secret của webhook / cron đủ dài
for (const name of ["PUSH_DISPATCH_SECRET", "PAYMENT_WEBHOOK_SECRET", "CRON_SECRET", "HEALTH_CHECK_SECRET"]) {
  const v = process.env[name];
  if (v && v.length < 32) warnings.push(`${name} ngắn (${v.length} ký tự) — nên ≥ 32 ký tự ngẫu nhiên`);
}

// 6. (--scan-build) Dò giá trị bí mật trong JS / CSS / HTML gửi xuống trình duyệt
if (process.argv.includes("--scan-build")) {
  const dirs = [".next/static"].filter(existsSync);
  if (!dirs.length) errors.push("Chưa có .next/static — chạy sau `npm run build`");
  const secrets = SERVER_SECRETS.map((n) => [n, process.env[n]]).filter(([, v]) => v && v.length >= 12);
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
  dirs.forEach(walk);
  const leaks = new Map();
  for (const file of files.filter((f) => /\.(js|css|html|json|txt|map)$/.test(f))) {
    const text = readFileSync(file, "utf8");
    for (const [name, value] of secrets) if (text.includes(value)) leaks.set(name, [...(leaks.get(name) ?? []), file]);
  }
  for (const [name, list] of leaks) errors.push(`RÒ RỈ: giá trị ${name} xuất hiện trong ${list.length} file gửi xuống trình duyệt (vd. ${list[0]}) — đổi khoá ngay!`);
  if (!leaks.size && dirs.length) ok.push(`Đã dò ${files.length} file trong .next/static: không thấy giá trị bí mật nào (${secrets.map(([n]) => n).join(", ") || "chưa đặt biến bí mật"})`);
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of warnings) console.warn(`! ${m}`);
for (const m of errors) console.error(`✗ ${m}`);
if (errors.length) {
  console.error(`\nKiểm tra biến môi trường THẤT BẠI (${errors.length} lỗi). Xem docs/deployment.md.`);
  process.exit(1);
}
console.log(`Kiểm tra biến môi trường: OK${warnings.length ? ` (${warnings.length} lưu ý)` : ""}.`);
