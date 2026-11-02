// Ghép mọi file supabase/migrations/*.sql (theo thứ tự tên) → supabase/schema.sql,
// để dựng database mới (project thử nghiệm / staging) bằng 1 lần dán vào SQL Editor.
// Chạy lại sau mỗi lần thêm migration: `npm run db:schema`. `--check`: chỉ báo lỗi nếu schema.sql đã cũ (dùng cho CI).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = "supabase/migrations";
const OUT = "supabase/schema.sql";

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const parts = files.map((f) => `-- >>> ${DIR}/${f}\n${readFileSync(`${DIR}/${f}`, "utf8").replace(/\r\n/g, "\n").trimEnd()}\n`);
const schema = `-- Ghép tất cả file trong supabase/migrations/ theo thứ tự — dán vào SQL Editor nếu không dùng Supabase CLI.\n-- File tự sinh bằng \`npm run db:schema\` — đừng sửa tay.\n\n${parts.join("\n")}`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
  } catch {}
  if (current !== schema) {
    console.error(`${OUT} chưa khớp với ${DIR}/ — chạy \`npm run db:schema\`.`);
    process.exit(1);
  }
  console.log(`${OUT} khớp ${files.length} migration.`);
} else {
  writeFileSync(OUT, schema);
  console.log(`Đã ghép ${files.length} migration → ${OUT}`);
}
