// Chuẩn bị project Supabase THỬ NGHIỆM cho E2E: `npm run e2e:setup`. Đọc .env.e2e. KHÔNG in giá trị khoá / mật khẩu.
//  0. Chỉ có E2E_SUPABASE_ACCESS_TOKEN (chưa có URL/khoá) → tự tạo project "th-edu-test" (hoặc dùng lại nếu đã có),
//     chờ project sẵn sàng, lấy khoá anon / service_role → ghi vào .env.e2e.
//  1. Chặn nhầm: project thử nghiệm không được trùng project dữ liệu thật (.env.local).
//  2. Có E2E_SUPABASE_ACCESS_TOKEN → tự nạp supabase/schema.sql (nếu chưa có bảng) + seed/demo.sql + seed/e2e.sql
//     qua Supabase Management API. Không có → in hướng dẫn dán 3 file vào SQL Editor.
//  3. Kiểm tra: đăng nhập được 3 tài khoản test, đúng vai trò; có học phí, tài khoản nhận tiền, khung giờ tư vấn.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "pdoigncrmukdpkvbwrgn"; // project dữ liệu thật (package.json → db:types)
const TEST_PROJECT = "th-edu-test";
const API = "https://api.supabase.com/v1";

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(".env.e2e")) fail("Chưa có .env.e2e — sao chép từ .env.e2e.example rồi điền.");
process.loadEnvFile(".env.e2e");

const token = process.env.E2E_SUPABASE_ACCESS_TOKEN;
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/** Ghi / thay giá trị biến trong .env.e2e (giữ nguyên các dòng khác). */
function saveEnv(values) {
  let text = readFileSync(".env.e2e", "utf8");
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
    process.env[k] = v;
  }
  writeFileSync(".env.e2e", text);
}

// ---- 0. Tự tạo project thử nghiệm -------------------------------------------------------------------
if (!process.env.E2E_SUPABASE_URL && token) {
  try {
    const projects = await api("/projects");
    let project = projects.find((p) => p.name === TEST_PROJECT);
    if (project) console.log(`✓ Dùng lại project "${TEST_PROJECT}" (${project.id})`);
    else {
      // Token giới hạn quyền có thể không liệt kê được organization → lấy organization của project sẵn có
      const orgs = await api("/organizations").catch(() => []);
      if (!orgs.length && projects[0]) orgs.push({ id: projects[0].organization_id, name: projects[0].organization_id });
      if (!orgs.length) fail("Tài khoản Supabase chưa có organization — tạo 1 organization trên supabase.com trước.");
      const dbPass = randomBytes(18).toString("base64url");
      project = await api("/projects", {
        method: "POST",
        // Singapore: gần Việt Nam nhất
        body: JSON.stringify({ name: TEST_PROJECT, organization_id: orgs[0].id, region: "ap-southeast-1", db_pass: dbPass }),
      });
      saveEnv({ E2E_DB_PASSWORD: dbPass });
      console.log(`✓ Đã tạo project "${TEST_PROJECT}" (${project.id}) trong organization "${orgs[0].name}" — đang khởi động (1–3 phút)…`);
    }
    if (project.id === PROD_REF) fail("Project tìm được là project DỮ LIỆU THẬT — dừng.");
    for (let i = 0; ; i++) {
      const p = await api(`/projects/${project.id}`);
      if (p.status === "ACTIVE_HEALTHY") break;
      if (i > 60) fail(`Project chưa sẵn sàng sau 10 phút (trạng thái ${p.status}) — chạy lại sau.`);
      await sleep(10_000);
    }
    const keys = await api(`/projects/${project.id}/api-keys?reveal=true`);
    const key = (name) => keys.find((k) => k.name === name)?.api_key;
    if (!key("anon") || !key("service_role")) fail("Không lấy được khoá anon / service_role của project thử nghiệm.");
    saveEnv({
      E2E_SUPABASE_URL: `https://${project.id}.supabase.co`,
      E2E_SUPABASE_ANON_KEY: key("anon"),
      E2E_SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
    });
    console.log("✓ Đã ghi URL + khoá của project thử nghiệm vào .env.e2e");
  } catch (e) {
    fail(`Không tạo / lấy được project thử nghiệm: ${e.message}`);
  }
}

// Chỉ lấy gốc https://<ref>.supabase.co (dán nhầm địa chỉ Data API ".../rest/v1/" vẫn chạy đúng)
const url = process.env.E2E_SUPABASE_URL && new URL(process.env.E2E_SUPABASE_URL).origin;
const anon = process.env.E2E_SUPABASE_ANON_KEY;
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  fail(
    "Điền E2E_SUPABASE_ACCESS_TOKEN (supabase.com → Account → Access Tokens) trong .env.e2e để script tự tạo project thử nghiệm,\n" +
      "  hoặc tự điền E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY của project thử nghiệm.",
  );
}

// ---- 1. Chặn nhầm project dữ liệu thật ------------------------------------------------------------
const host = new URL(url).hostname;
const ref = host.split(".")[0];
let realHost;
try {
  const m = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"));
  if (m) realHost = new URL(m[1].trim().replace(/^["']|["']$/g, "")).hostname;
} catch {}
if (ref === PROD_REF || host === realHost) fail("E2E_SUPABASE_URL đang trỏ vào project DỮ LIỆU THẬT — tạo project Supabase riêng cho thử nghiệm.");
console.log(`✓ Project thử nghiệm: ${ref} (khác project dữ liệu thật)`);

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- 2. Nạp schema + dữ liệu test -------------------------------------------------------------------
// Cách 1 — E2E_DB_URL: kết nối thẳng Postgres của project thử nghiệm (Connect → Session pooler). Không cần quyền Management API.
// Cách 2 — E2E_SUPABASE_ACCESS_TOKEN: chạy qua Management API (token phải có quyền chạy SQL).
// Bỏ dấu [ ] thường bị giữ lại khi thay "[YOUR-PASSWORD]" trong chuỗi mẫu của Supabase
const dbUrl = process.env.E2E_DB_URL?.replace(/^(postgres(?:ql)?:\/\/[^:]+:)\[([^\]]*)\]@/, "$1$2@");
let pgClient;
if (dbUrl) {
  // Chuỗi kết nối phải là của đúng project thử nghiệm (user "postgres.<ref>" hoặc host "db.<ref>.supabase.co")
  if (!dbUrl.includes(ref) || dbUrl.includes(PROD_REF)) fail("E2E_DB_URL không phải chuỗi kết nối của project thử nghiệm — kiểm tra lại.");
  const { default: pg } = await import("pg");
  pgClient = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await pgClient.connect();
  } catch (e) {
    fail(`Không kết nối được database thử nghiệm (${e.message}) — kiểm tra E2E_DB_URL (mật khẩu, dùng "Session pooler").`);
  }
}

async function runSql(file) {
  const query = readFileSync(file, "utf8");
  if (pgClient) {
    try {
      await pgClient.query(query);
    } catch (e) {
      fail(`Chạy ${file} lỗi: ${e.message}${e.where ? ` (${e.where.split("\n")[0]})` : ""}`);
    }
  } else {
    // Project vừa tạo: database có thể cần thêm ít giây mới nhận truy vấn → thử lại khi lỗi phía máy chủ
    for (let attempt = 1; ; attempt++) {
      try {
        await api(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
        break;
      } catch (e) {
        if (/→ 403/.test(e.message)) {
          fail(
            "Token không có quyền chạy SQL. Điền E2E_DB_URL trong .env.e2e: Supabase → project thử nghiệm → nút Connect →\n" +
              '  "Session pooler" → copy chuỗi postgresql://... (thay [YOUR-PASSWORD] bằng mật khẩu database; quên → Database Settings → Reset password).',
          );
        }
        if (attempt >= 4 || !/→ 5\d\d/.test(e.message)) fail(`Chạy ${file} lỗi: ${e.message}`);
        await sleep(15_000);
      }
    }
  }
  console.log(`✓ Đã chạy ${file}`);
}

// Dò bằng GET (yêu cầu HEAD không trả nội dung lỗi → bảng thiếu vẫn trông như "không lỗi")
const { error: schemaErr } = await admin.from("consultation_availability").select("id").limit(1);
const hasSchema = !schemaErr;
if (pgClient || token) {
  if (!hasSchema) await runSql("supabase/schema.sql");
  else console.log("✓ Đã có schema (bỏ qua schema.sql)");
  await runSql("supabase/seed/demo.sql");
  await runSql("supabase/seed/e2e.sql");
  if (pgClient) {
    // Bảng mới → Data API (PostgREST) nạp lại cấu trúc, rồi mới kiểm tra
    await pgClient.query("notify pgrst, 'reload schema'");
    await pgClient.end();
    await sleep(5_000);
  }
} else if (!hasSchema) {
  fail(
    "Project thử nghiệm chưa có bảng. Mở Supabase → SQL Editor của project THỬ NGHIỆM, lần lượt dán & chạy:\n" +
      "    1) supabase/schema.sql   2) supabase/seed/demo.sql   3) supabase/seed/e2e.sql\n" +
      "  (hoặc điền E2E_DB_URL — nút Connect → Session pooler — để script tự chạy) rồi chạy lại `npm run e2e:setup`.",
  );
}

// ---- 3. Kiểm tra dữ liệu & đăng nhập ------------------------------------------------------------------
const problems = [];
const accounts = [
  ["parent", process.env.E2E_PARENT_LOGIN, process.env.E2E_PARENT_PASSWORD],
  ["teacher", process.env.E2E_TEACHER_LOGIN, process.env.E2E_TEACHER_PASSWORD],
  ["admin", process.env.E2E_ADMIN_LOGIN, process.env.E2E_ADMIN_PASSWORD],
];
for (const [role, login, password] of accounts) {
  if (!login || !password) {
    problems.push(`Thiếu E2E_${role.toUpperCase()}_LOGIN / _PASSWORD`);
    continue;
  }
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const isEmail = login.includes("@");
  const phone = login.replace(/\D/g, "").replace(/^0/, "84");
  const { data, error } = await client.auth.signInWithPassword(isEmail ? { email: login, password } : { phone, password });
  if (error) {
    problems.push(`Không đăng nhập được tài khoản ${role} (${error.message}) — đã chạy seed/demo.sql + seed/e2e.sql chưa?`);
    continue;
  }
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (profile?.role !== role) problems.push(`Tài khoản ${role} đang có vai trò "${profile?.role}"`);
  else console.log(`✓ Đăng nhập được tài khoản ${role}`);
}

const checks = [
  ["học phí còn nợ của học sinh test", admin.from("fees").select("id", { count: "exact" }).lt("paid_amount", 1)],
  ["tài khoản nhận học phí", admin.from("payment_config").select("id", { count: "exact" })],
  ["khung giờ tư vấn của giáo viên", admin.from("consultation_availability").select("id", { count: "exact" }).eq("active", true)],
];
for (const [label, q] of checks) {
  const { count, error } = await q;
  if (error || !count) problems.push(`Chưa có ${label} — chạy supabase/seed/e2e.sql`);
  else console.log(`✓ Có ${label}`);
}

if (problems.length) fail(`Chưa sẵn sàng:\n  - ${problems.join("\n  - ")}`);
console.log("\nSẵn sàng. Chạy E2E: npm run test:e2e   (xem từng bước: npm run test:e2e:ui)");
