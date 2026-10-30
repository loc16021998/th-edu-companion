"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, School, UserRound } from "lucide-react";
import { fieldClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

/** Chọn lớp + học sinh cho trang phân tích của giáo viên (giữ tháng đang xem). */
export function AnalyticsPicker({
  classes,
  classKey,
  students,
  studentId,
  month,
}: {
  classes: { key: string; label: string; count: number }[];
  classKey: string;
  students: { id: string; full_name: string }[];
  studentId: string;
  month?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(next: { class?: string; student?: string }) {
    const q = new URLSearchParams({ class: next.class ?? classKey });
    if (next.student) q.set("student", next.student);
    if (month) q.set("month", month);
    startTransition(() => router.push(`${pathname}?${q}`));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 print:hidden">
      <label className="relative">
        <span className="sr-only">Lớp</span>
        <School className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <select className={cn(fieldClass, "pl-9 font-semibold")} value={classKey} disabled={pending} onChange={(e) => go({ class: e.target.value })}>
          {classes.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
      </label>
      <label className="relative">
        <span className="sr-only">Học sinh</span>
        <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <select className={cn(fieldClass, "pl-9 font-semibold")} value={studentId} disabled={pending} onChange={(e) => go({ student: e.target.value })}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        {pending && <Loader2 className="absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </label>
    </div>
  );
}
