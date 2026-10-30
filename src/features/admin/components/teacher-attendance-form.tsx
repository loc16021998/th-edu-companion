"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, CalendarDays, CheckCheck, CircleAlert, CircleCheck, Clock, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { CAMPUS_LABELS, countAttendance } from "@/config/constants";
import { dayMonth, weekdayLong } from "@/lib/date";
import { SESSION_LABEL, latestSchoolDay } from "@/lib/schedule";
import { confirmDiscardChanges, setUnsavedChanges } from "@/lib/unsaved-changes";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { saveTeacherAttendance } from "../actions";
import type { PersonOption } from "../queries";
import { toast } from "@/components/ui/toast";

type Status = Enums<"attendance_status">;
type Row = { status: Status; note: string };

const OPTIONS: { value: Status; label: string; icon: typeof CircleCheck; active: string }[] = [
  { value: "present", label: "Có mặt", icon: CircleCheck, active: "bg-emerald-500 text-white shadow-sm" },
  { value: "late", label: "Đi muộn", icon: Clock, active: "bg-amber-500 text-white shadow-sm" },
  { value: "absent", label: "Vắng", icon: X, active: "bg-rose-500 text-white shadow-sm" },
  // Đơn xin nghỉ được duyệt tự đặt trạng thái này; giáo viên cũng chọn tay được
  { value: "absent_with_permission", label: "Có phép", icon: CalendarCheck, active: "bg-sky-500 text-white shadow-sm" },
];

export function TeacherAttendanceForm({
  date,
  today,
  teachers,
  saved,
}: {
  date: string;
  today: string;
  teachers: PersonOption[];
  saved: Record<string, { status: Status; note: string | null }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const initial = () =>
    Object.fromEntries(teachers.map((t) => [t.id, { status: saved[t.id]?.status ?? "present", note: saved[t.id]?.note ?? "" }])) as Record<
      string,
      Row
    >;
  const [rows, setRows] = useState<Record<string, Row>>(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setUnsavedChanges(dirty);
    return () => setUnsavedChanges(false);
  }, [dirty]);

  function update(id: string, changes: Partial<Row>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { status: "present", note: "" }), ...changes } }));
    setDirty(true);
  }

  async function goTo(value: string) {
    if (!value || value > today) return;
    if (!(await confirmDiscardChanges())) return;
    // Chủ nhật không có buổi học → tự chuyển về Thứ 7 liền trước
    startNavigation(() => router.push(`${pathname}?date=${latestSchoolDay(value)}`));
  }

  function save() {
    setMessage(null);
    startSaving(async () => {
      const res = await saveTeacherAttendance({
        date,
        records: teachers.map((t) => ({
          teacherId: t.id,
          status: rows[t.id]?.status ?? "present",
          note: rows[t.id]?.status === "present" ? "" : (rows[t.id]?.note ?? ""),
        })),
      });
      if (!res.ok) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      setDirty(false);
      setMessage({ ok: true, text: `Đã lưu chấm công ${res.data.saved} giáo viên.` });
      toast.success("Đã lưu chấm công", `${res.data.saved} giáo viên.`);
      router.refresh();
    });
  }

  const counts = countAttendance(teachers.map((t) => rows[t.id]?.status ?? "present"));
  const unsaved = teachers.filter((t) => !saved[t.id]).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="ta-date" className="text-xs font-semibold text-muted-foreground">
          Buổi học
        </label>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="ta-date"
            type="date"
            value={date}
            max={today}
            disabled={navigating}
            onChange={(e) => goTo(e.target.value)}
            className={cn(fieldClass, "pl-10 font-semibold")}
          />
        </div>
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {weekdayLong(date)}, {dayMonth(date)} · Buổi {SESSION_LABEL}
          {navigating && <Loader2 className="ml-1 size-3.5 animate-spin" />}
        </p>
      </div>

      {teachers.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Chưa có tài khoản giáo viên. Thêm giáo viên ở tab <b>Lớp học</b>.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Có mặt {counts.present}</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Muộn {counts.late}</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Vắng {counts.absent}</span>
        {counts.absent_with_permission > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">Có phép {counts.absent_with_permission}</span>
        )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto rounded-full"
              onClick={() => teachers.forEach((t) => update(t.id, { status: "present" }))}
            >
              <CheckCheck /> Tất cả có mặt
            </Button>
          </div>
          {unsaved > 0 && (
            <p className="text-xs text-muted-foreground">
              {unsaved === teachers.length ? "Chưa chấm công buổi này — mặc định tất cả Có mặt." : `${unsaved} giáo viên chưa được lưu chấm công.`}
            </p>
          )}

          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {teachers.map((t) => {
              const row = rows[t.id] ?? { status: "present" as Status, note: "" };
              return (
                <li key={t.id} className="space-y-2 p-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
                  <div className="flex min-w-0 items-center gap-3 sm:w-60 sm:shrink-0">
                    <StudentAvatar student={{ id: t.id, full_name: t.full_name || "?", avatar_url: null }} className="size-9 text-sm" />
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{t.full_name || "(Chưa có tên)"}</p>
                      <p className="break-words text-xs text-muted-foreground">
                        {t.campus ? CAMPUS_LABELS[t.campus] : "Chưa gán cơ sở"}
                        {!saved[t.id] && <span className="font-medium text-amber-600"> · Chưa lưu</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div role="radiogroup" aria-label={`Chấm công ${t.full_name}`} className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                      {OPTIONS.map(({ value, label, icon: Icon, active }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={row.status === value}
                          onClick={() => update(t.id, { status: value })}
                          className={cn(
                            // Biểu tượng trên, chữ dưới → nhãn không bị cắt khi ô hẹp
                            "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center text-xs font-bold leading-tight transition-all active:scale-95 lg:min-h-11 lg:flex-row lg:gap-1 lg:text-sm",
                            row.status === value ? active : "text-muted-foreground hover:bg-background/60",
                          )}
                        >
                          <Icon className="size-5 shrink-0 lg:size-4" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    {row.status !== "present" && (
                      <input
                        value={row.note}
                        onChange={(e) => update(t.id, { note: e.target.value })}
                        maxLength={200}
                        placeholder={row.status === "late" ? "Ghi chú (vd: đến lúc 18:15)" : "Lý do vắng (vd: có phép, dạy thay...)"}
                        aria-label={`Ghi chú cho ${t.full_name}`}
                        className={cn(fieldClass, "h-9 rounded-lg")}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={cn(
            "flex items-start gap-2 rounded-xl p-3 text-sm font-medium",
            message.ok ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground",
          )}
        >
          {message.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          {message.text}
        </p>
      )}

      {teachers.length > 0 && (
        <div className="sticky bottom-[calc(var(--bottom-nav,4.5rem)+env(safe-area-inset-bottom))] z-20 md:bottom-4">
          <Button type="button" size="lg" className="h-12 w-full rounded-xl text-base shadow-lg" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Đang lưu..." : `Lưu chấm công (${teachers.length})`}
            {dirty && !saving && <span className="size-2 rounded-full bg-amber-300" aria-label="có thay đổi chưa lưu" />}
          </Button>
        </div>
      )}
    </div>
  );
}
