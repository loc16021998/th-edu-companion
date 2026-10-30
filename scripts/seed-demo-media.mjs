// Tải ảnh minh hoạ (SVG tự vẽ) cho các nhận xét demo lên bucket `student-activities`.
//   node scripts/seed-demo-media.mjs           → xoá ảnh demo cũ rồi tải lại theo daily_reports.media_urls
//   node scripts/seed-demo-media.mjs --remove  → chỉ xoá ảnh demo
// Chạy SAU supabase/seed/demo.sql. Đăng nhập bằng tài khoản giáo viên demo → đi qua storage RLS như thật.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const BUCKET = "student-activities";
const STUDENTS = ["d1000000-0000-4000-8000-000000000001", "d1000000-0000-4000-8000-000000000002"];
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const SCENES = [
  { title: "Giờ học Tiền tiểu học", sub: "Làm quen chữ cái", emoji: "📚", c1: "#38bdf8", c2: "#6366f1" },
  { title: "Luyện chữ đẹp", sub: "Tô nét cơ bản", emoji: "✏️", c1: "#fb7185", c2: "#f97316" },
  { title: "Toán tư duy", sub: "Xếp hình tangram", emoji: "🧩", c1: "#fbbf24", c2: "#f97316" },
  { title: "Vui chơi ngoài trời", sub: "Sân chơi cơ sở", emoji: "⚽", c1: "#34d399", c2: "#0d9488" },
  { title: "Vẽ tranh", sub: "Chủ đề: Gia đình em", emoji: "🎨", c1: "#c084fc", c2: "#ec4899" },
  { title: "Giờ ăn trưa", sub: "Bữa trưa dinh dưỡng", emoji: "🍱", c1: "#facc15", c2: "#84cc16" },
  { title: "Giờ đọc sách", sub: "Thư viện lớp học", emoji: "📖", c1: "#60a5fa", c2: "#22d3ee" },
  { title: "Âm nhạc", sub: "Hát cùng các bạn", emoji: "🎵", c1: "#f472b6", c2: "#a855f7" },
];

const esc = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function svgFor(path) {
  const [, date = "", file = "1.svg"] = path.split("/");
  const n = Number.parseInt(file, 10) || 1;
  const seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  const s = SCENES[(n - 1 + seed) % SCENES.length];
  const ddmm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.c1}"/><stop offset="1" stop-color="${s.c2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="680" cy="120" r="170" fill="#fff" fill-opacity=".15"/>
  <circle cx="90" cy="700" r="200" fill="#fff" fill-opacity=".12"/>
  <circle cx="160" cy="150" r="22" fill="#fff" fill-opacity=".5"/><circle cx="640" cy="560" r="14" fill="#fff" fill-opacity=".5"/>
  <text x="400" y="420" font-size="260" text-anchor="middle">${s.emoji}</text>
  <text x="400" y="560" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="56" font-weight="800" fill="#fff" text-anchor="middle">${esc(s.title)}</text>
  <text x="400" y="620" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="34" fill="#fff" fill-opacity=".9" text-anchor="middle">${esc(s.sub)} · ${ddmm}</text>
  <text x="400" y="760" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="22" fill="#fff" fill-opacity=".7" text-anchor="middle">Ảnh minh hoạ — dữ liệu demo</text>
</svg>`;
}

async function listDemoObjects() {
  const paths = [];
  for (const student of STUDENTS) {
    const { data: folders, error } = await supabase.storage.from(BUCKET).list(student, { limit: 1000 });
    if (error) throw error;
    for (const folder of folders) {
      const { data: files, error: e2 } = await supabase.storage.from(BUCKET).list(`${student}/${folder.name}`, { limit: 1000 });
      if (e2) throw e2;
      paths.push(...files.map((f) => `${student}/${folder.name}/${f.name}`));
    }
  }
  return paths;
}

async function main() {
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: "giaovien.demo@th-edu.local",
    password: "Demo@2026",
  });
  if (loginError) throw new Error(`Không đăng nhập được giáo viên demo (đã chạy demo.sql chưa?): ${loginError.message}`);

  const old = await listDemoObjects();
  if (old.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(old);
    if (error) throw error;
  }
  console.log(`Đã xoá ${old.length} ảnh demo cũ`);
  if (process.argv.includes("--remove")) return;

  const { data: reports, error } = await supabase.from("daily_reports").select("media_urls").in("student_id", STUDENTS);
  if (error) throw error;
  const paths = reports.flatMap((r) => r.media_urls);

  let done = 0;
  for (const path of paths) {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(svgFor(path)), { contentType: "image/svg+xml" });
    if (upErr) throw new Error(`${path}: ${upErr.message}`);
    done++;
  }
  console.log(`Đã tải lên ${done}/${paths.length} ảnh minh hoạ`);
}

main()
  .catch((err) => {
    console.error("Lỗi:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => supabase.auth.signOut());
