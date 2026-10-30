"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheck, CheckCheck, CircleAlert, CircleCheck, Clock, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { countAttendance } from "@/config/constants";
import { cn } from "@/lib/utils";
import { setUnsavedChanges } from "@/lib/unsaved-changes";
import { saveAttendance } from "@/features/attendance/actions";
import { saveAttendanceSchema, type SaveAttendanceInput } from "@/features/attendance/schema";
import type { Enums } from "@/types/database.types";
import { confirmSheet } from "@/components/ui/confirm-sheet";
import { toast } from "@/components/ui/toast";

type Status = Enums<"attendance_status">;
type Student = { id: string; full_name: string; avatar_url: string | null };

const OPTIONS: { value: Status; label: string; icon: typeof CircleCheck; active: string }[] = [
  { value: "present", label: "Có mặt", icon: CircleCheck, active: "bg-emerald-500 text-white shadow-sm" },
  { value: "late", label: "Đi muộn", icon: Clock, active: "bg-amber-500 text-white shadow-sm" },
  { value: "absent", label: "Vắng", icon: X, active: "bg-rose-500 text-white shadow-sm" },
  // Đơn xin nghỉ được duyệt tự đặt trạng thái này; giáo viên cũng chọn tay được
  { value: "absent_with_permission", label: "Có phép", icon: CalendarCheck, active: "bg-sky-500 text-white shadow-sm" },
];

/** Công tắc 3 trạng thái — 1 chạm. */
function StatusToggle({ value, onChange, name }: { value: Status; onChange: (v: Status) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={`Điểm danh ${name}`} className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
      {OPTIONS.map(({ value: v, label, icon: Icon, active }) => {
        const checked = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(v)}
            className={cn(
              // Biểu tượng trên, chữ dưới → nhãn có đủ bề rộng (chữ ≥ 14px không bị cắt "Có ph…")
              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center text-xs font-bold leading-tight transition-all active:scale-95 sm:min-h-11 sm:flex-row sm:gap-1 sm:text-sm",
              checked ? active : "text-muted-foreground hover:bg-background/60",
            )}
          >
            <Icon className="size-5 shrink-0 sm:size-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AttendanceForm({
  date,
  students,
  saved,
  onSaved,
  onCancel,
}: {
  date: string;
  students: Student[];
  /** Điểm danh đã lưu trong DB cho ngày này */
  saved: Record<string, { status: Status; note: string | null }>;
  /** Có (chế độ xem + nút Sửa của quản trị): lưu xong gọi về để quay lại chế độ xem */
  onSaved?: (message: string) => void;
  /** Có: hiện nút "Huỷ" bỏ thay đổi, quay lại chế độ xem */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const form = useForm<SaveAttendanceInput>({
    resolver: zodResolver(saveAttendanceSchema),
    defaultValues: {
      date,
      records: students.map((s) => ({
        studentId: s.id,
        status: saved[s.id]?.status ?? "present", // mặc định Có mặt → GV chỉ chạm vào bạn vắng/muộn
        note: saved[s.id]?.note ?? "",
      })),
    },
  });
  const { control, handleSubmit, register, setValue, reset, formState } = form;
  const { fields } = useFieldArray({ control, name: "records" });
  const records = useWatch({ control, name: "records" });

  const counts = countAttendance(records.map((r) => r.status));
  const unsavedCount = students.filter((s) => !saved[s.id]).length;

  // Cảnh báo khi rời trang / đổi lớp-ngày mà chưa lưu
  useEffect(() => {
    setUnsavedChanges(formState.isDirty);
    if (!formState.isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formState.isDirty]);
  useEffect(() => () => setUnsavedChanges(false), []);

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      const res = await saveAttendance(values);
      if (!res.ok) {
        setMessage({ type: "error", text: res.error });
        toast.error("Chưa lưu được điểm danh", res.error);
        return;
      }
      reset(values);
      const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
      const text = `Đã lưu điểm danh ${res.data.saved} học sinh lúc ${time}.`;
      toast.success("Đã lưu điểm danh ✅", `${res.data.saved} học sinh lúc ${time} — phụ huynh nhận thông báo ngay.`);
      router.refresh();
      if (onSaved) {
        setUnsavedChanges(false);
        onSaved(text);
        return;
      }
      setMessage({ type: "success", text });
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Không thể kết nối máy chủ. Vui lòng thử lại." });
      toast.error("Mất kết nối", "Chưa lưu được điểm danh. Kiểm tra mạng rồi bấm Lưu lại.");
    }
  });

  const markAllPresent = () => {
    fields.forEach((_, i) => setValue(`records.${i}.status`, "present", { shouldDirty: true }));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Tổng hợp */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Có mặt {counts.present}</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Muộn {counts.late}</span>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Vắng {counts.absent}</span>
        {counts.absent_with_permission > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">Có phép {counts.absent_with_permission}</span>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto rounded-full" onClick={markAllPresent}>
          <CheckCheck /> Tất cả có mặt
        </Button>
      </div>
      {unsavedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {unsavedCount === students.length
            ? "Chưa điểm danh ngày này — mặc định tất cả Có mặt, chạm để đổi bạn đi muộn/vắng."
            : `${unsavedCount} học sinh chưa được lưu điểm danh.`}
        </p>
      )}

      {/* Danh sách */}
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {fields.map((field, i) => {
          const student = students[i]!;
          const status = records[i]?.status ?? "present";
          const rowErrors = formState.errors.records?.[i];
          return (
            <li key={field.id} className="space-y-2 p-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
              <div className="flex min-w-0 items-center gap-3 sm:w-56 sm:shrink-0">
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <StudentAvatar student={student} className="size-9 text-sm" />
                <div className="min-w-0">
                  <p className="break-words font-semibold">{student.full_name}</p>
                  {!saved[student.id] && <p className="text-xs font-medium text-amber-600">Chưa lưu</p>}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <Controller
                  control={control}
                  name={`records.${i}.status`}
                  render={({ field: f }) => <StatusToggle value={f.value} onChange={f.onChange} name={student.full_name} />}
                />
                {status !== "present" && (
                  <Input
                    {...register(`records.${i}.note`)}
                    placeholder={status === "late" ? "Ghi chú (vd: đến lúc 8h15)" : "Lý do vắng (vd: ốm, có phép)"}
                    aria-invalid={!!rowErrors?.note}
                    className="h-9 rounded-lg"
                  />
                )}
                {rowErrors?.note && <p className="text-xs text-destructive">{rowErrors.note.message}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Thanh lưu dính đáy (phía trên thanh tab) */}
      <div className="sticky bottom-[calc(var(--bottom-nav,4.5rem)+env(safe-area-inset-bottom))] z-20 space-y-2 md:bottom-4">
        {message && (
          <p
            role={message.type === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2 rounded-xl p-3 text-sm font-medium shadow-lg",
              message.type === "success" ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground",
            )}
          >
            {message.type === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {message.text}
          </p>
        )}
        {formState.errors.records?.root?.message || formState.errors.records?.message || formState.errors.date?.message ? (
          <p role="alert" className="rounded-xl bg-destructive p-3 text-sm text-destructive-foreground">
            {formState.errors.date?.message ?? formState.errors.records?.root?.message ?? formState.errors.records?.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 rounded-xl bg-background text-base shadow-lg"
              disabled={formState.isSubmitting}
              onClick={async () => {
                if (formState.isDirty && !(await confirmSheet({ title: "Bỏ các thay đổi chưa lưu?", confirmLabel: "Bỏ thay đổi", cancelLabel: "Tiếp tục sửa", tone: "danger" }))) return;
                setUnsavedChanges(false);
                onCancel();
              }}
            >
              <X /> Huỷ
            </Button>
          )}
          <Button type="submit" size="lg" className="h-12 flex-1 rounded-xl text-base shadow-lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {formState.isSubmitting ? "Đang lưu..." : `Lưu điểm danh (${students.length})`}
            {formState.isDirty && !formState.isSubmitting && <span className="size-2 rounded-full bg-amber-300" aria-label="có thay đổi chưa lưu" />}
          </Button>
        </div>
      </div>
    </form>
  );
}
