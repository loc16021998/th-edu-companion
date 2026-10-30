import Link from "next/link";
import { CircleCheck, PencilLine } from "lucide-react";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { ATTENDANCE_STYLE, MOOD_STYLE } from "@/config/ui-styles";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { isAbsence } from "@/config/constants";

type Row = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  attendance: Enums<"attendance_status"> | null;
  report: { mood: Enums<"mood"> | null } | null;
};

/** Danh sách lớp để chọn học sinh viết sổ — hiển thị trạng thái đã viết / điểm danh. */
export function StudentPicker({
  rows,
  selectedId,
  hrefFor,
  className,
}: {
  rows: Row[];
  selectedId: string | null;
  hrefFor: (studentId: string) => string;
  className?: string;
}) {
  const done = rows.filter((r) => r.report).length;
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <aside className={cn("space-y-3", className)}>
      <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>Đã viết sổ</span>
          <span className="tabular-nums">
            {done}/{rows.length}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {rows.map((r) => {
          const selected = r.id === selectedId;
          const absent = isAbsence(r.attendance);
          return (
            <li key={r.id}>
              <Link
                href={hrefFor(r.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors active:bg-accent",
                  selected ? "bg-primary/10" : "hover:bg-muted/60",
                  absent && !r.report && "opacity-60",
                )}
              >
                <StudentAvatar student={r} className="size-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className={cn("break-words text-sm", selected ? "font-bold" : "font-semibold")}>{r.full_name}</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {r.attendance ? ATTENDANCE_STYLE[r.attendance].label : "Chưa điểm danh"}
                  </p>
                </div>
                {r.report ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    {r.report.mood && <span aria-hidden>{MOOD_STYLE[r.report.mood].emoji}</span>}
                    <CircleCheck className="size-4" />
                    <span className="sr-only">Đã viết</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <PencilLine className="size-3.5" /> Chưa viết
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
