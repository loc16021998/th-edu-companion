// Kiểm tra SUPABASE_SERVICE_ROLE_KEY trong .env.local có dùng được cho quản lý tài khoản không.
// Chạy: node --env-file=.env.local scripts/check-service-key.mjs   (không in khoá ra màn hình)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error("✗ Thiếu NEXT_PUBLIC_SUPABASE_URL trong .env.local");
  process.exit(1);
}
if (!key) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY đang trống trong .env.local");
  process.exit(1);
}
if (key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY đang trùng khoá anon — cần khoá service_role (Secret key).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
if (error) {
  console.error(`✗ Khoá không dùng được (${error.status ?? "?"}): ${error.message}`);
  console.error("  → Lấy lại khoá service_role tại Supabase → Project Settings → API Keys.");
  process.exit(1);
}
console.log(`✓ Khoá service_role hợp lệ — truy cập được Auth Admin (${data.users.length ? "có" : "chưa có"} người dùng).`);
console.log("  Khởi động lại server (npm run dev / npm start) để áp dụng.");
