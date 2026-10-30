import { DatabaseZap } from "lucide-react";
import type { RequiredTable } from "../queries";

/** Migration → bảng mà nó tạo. Thứ tự = thứ tự cần chạy. */
const MIGRATIONS: { file: string; tables: RequiredTable[] }[] = [
  { file: "supabase/migrations/20261022000000_notifications.sql", tables: ["notifications"] },
  { file: "supabase/migrations/20261023000000_classes_teacher_attendance.sql", tables: ["classes", "teacher_attendance"] },
];

/** Hiển thị khi database chưa chạy đủ migration — thay cho lỗi khó hiểu. */
export function SetupRequired({ missing }: { missing: RequiredTable[] }) {
  const pending = MIGRATIONS.filter((m) => m.tables.some((t) => missing.includes(t)));

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <DatabaseZap className="size-6" />
        </span>
        <div>
          <h1 className="text-lg font-bold">Database chưa được cập nhật</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Khu Quản trị cần các bảng mới chưa có trên Supabase:{" "}
            <span className="font-mono text-xs font-semibold text-foreground">{missing.join(", ")}</span>.
          </p>
        </div>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Mở <b>Supabase Dashboard → SQL Editor</b>.
        </li>
        <li>
          Lần lượt dán và chạy nội dung {pending.length > 1 ? "các file sau (đúng thứ tự)" : "file sau"}:
          <ul className="mt-1.5 space-y-1">
            {pending.map((m) => (
              <li key={m.file} className="break-all rounded-lg bg-muted px-2 py-1 font-mono text-xs">
                {m.file}
              </li>
            ))}
          </ul>
        </li>
        <li>Tải lại trang này.</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Hoặc dùng Supabase CLI: <span className="font-mono">npx supabase login</span> rồi{" "}
        <span className="font-mono">npx supabase db push</span>.
      </p>
    </div>
  );
}
