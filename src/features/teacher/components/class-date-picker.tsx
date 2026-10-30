"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Loader2, School } from "lucide-react";
import { Label } from "@/components/ui/label";
import { confirmDiscardChanges } from "@/lib/unsaved-changes";
import { dayMonth, weekdayLong } from "@/lib/date";
import { SESSION_LABEL, isSchoolDay, latestSchoolDay } from "@/lib/schedule";

const FIELD =
  "h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-3 text-base font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

export function ClassDatePicker({
  classes,
  classKey,
  date,
  today,
  studentId,
}: {
  classes: { key: string; label: string; count: number }[];
  classKey: string;
  date: string;
  today: string;
  /** Giữ học sinh đang chọn khi đổi ngày (màn sổ liên lạc) */
  studentId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // Ô chọn là controlled: không điều hướng → React tự giữ giá trị cũ
  async function navigate(next: { class?: string; date?: string; keepStudent?: boolean }) {
    if (!(await confirmDiscardChanges())) return false;
    const params = new URLSearchParams({ class: next.class ?? classKey, date: next.date ?? date });
    if (next.keepStudent && studentId) params.set("student", studentId);
    startTransition(() => router.push(`${pathname}?${params}`));
    return true;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="class-select" className="text-xs text-muted-foreground">
            Lớp học
          </Label>
          <div className="relative">
            <School className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="class-select"
              className={FIELD}
              value={classKey}
              disabled={pending}
              onChange={(e) => {
                const value = e.target.value;
                void navigate({ class: value });
              }}
            >
              {classes.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="date-input" className="text-xs text-muted-foreground">
            Ngày
          </Label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="date-input"
              type="date"
              className={FIELD}
              value={date}
              max={today}
              disabled={pending}
              onChange={(e) => {
                const value = e.target.value;
                // Bỏ qua giá trị rỗng/tương lai (iOS cho gõ vượt max); Chủ nhật → Thứ 7 liền trước
                if (!value || value > today) return;
                if (!isSchoolDay(value)) {
                  setNotice("Chủ nhật không có buổi học — đã chuyển về Thứ 7.");
                  void navigate({ date: latestSchoolDay(value), keepStudent: true });
                  return;
                }
                setNotice(null);
                void navigate({ date: value, keepStudent: true });
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-5 items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          {date === today ? "Hôm nay" : weekdayLong(date)}, {dayMonth(date)} · Buổi {SESSION_LABEL}
          {notice && <span className="ml-1 text-amber-600">· {notice}</span>}
        </span>
        {pending ? (
          <span className="flex items-center gap-1">
            <Loader2 className="size-3.5 animate-spin" /> Đang tải...
          </span>
        ) : (
          date !== latestSchoolDay(today) && (
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={() => navigate({ date: latestSchoolDay(today), keepStudent: true })}
            >
              Về hôm nay
            </button>
          )
        )}
      </div>
    </div>
  );
}
