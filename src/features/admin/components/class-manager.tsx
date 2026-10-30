"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, MapPin, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, fieldClass, useFormAction } from "@/components/shared/form-field";
import { CAMPUS_LABELS } from "@/config/constants";
import { DEFAULT_SHIFT, shiftScheduleLabel } from "@/lib/shifts";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { assignClassShift } from "@/features/shifts/actions";
import { assignClassTeacher, createClass, deleteClass } from "../actions";
import type { ClassRow, PersonOption } from "../queries";
import { confirmSheet } from "@/components/ui/confirm-sheet";

const CAMPUSES = Object.entries(CAMPUS_LABELS) as [Enums<"campus">, string][];

/** Ca học hiển thị trong ô chọn (đã tính sẵn nhãn giờ + ngày). */
export type ShiftOption = { id: string; name: string; label: string; is_active: boolean };

const DEFAULT_LABEL = `Lịch mặc định (${shiftScheduleLabel(DEFAULT_SHIFT)})`;

function ShiftSelect({
  id,
  shifts,
  value,
  name,
  disabled,
  onChange,
}: {
  id: string;
  shifts: ShiftOption[];
  value?: string;
  name?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      className={fieldClass}
      {...(value !== undefined ? { value } : { defaultValue: "" })}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      <option value="">{DEFAULT_LABEL}</option>
      {shifts
        .filter((s) => s.is_active || s.id === value)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.label}
            {!s.is_active ? " (tạm ngưng)" : ""}
          </option>
        ))}
    </select>
  );
}

function CreateClassForm({ teachers, shifts }: { teachers: PersonOption[]; shifts: ShiftOption[] }) {
  const { state, pending, formRef, onSubmit, errors: err } = useFormAction(createClass);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="flex items-center gap-2 font-bold">
        <Plus className="size-5 text-primary" /> Tạo lớp học mới
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cơ sở" htmlFor="class-campus" error={err.campus}>
          <select id="class-campus" name="campus" className={fieldClass} defaultValue={CAMPUSES[0]?.[0]}>
            {CAMPUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tên lớp" htmlFor="class-name" error={err.name}>
          <input id="class-name" name="name" className={fieldClass} placeholder="vd: K1A" maxLength={30} required aria-invalid={!!err.name} />
        </Field>
        <Field label="Giáo viên phụ trách" htmlFor="class-teacher" error={err.teacherId}>
          <select id="class-teacher" name="teacherId" className={fieldClass} defaultValue="">
            <option value="">— Chưa phân công —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || "(Chưa có tên)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ca học" htmlFor="class-shift" error={err.shiftId}>
          <ShiftSelect id="class-shift" name="shiftId" shifts={shifts} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Không chọn ca → lớp học theo lịch mặc định. Tạo thêm ca ở trang{" "}
        <Link href="/admin/shifts" className="font-semibold text-primary underline-offset-2 hover:underline">
          Ca học
        </Link>
        .
      </p>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingText="Đang tạo..." className="w-full sm:w-auto">
        <Plus /> Tạo lớp
      </SubmitButton>
    </form>
  );
}

function ClassCard({ cls, teachers, shifts }: { cls: ClassRow; teachers: PersonOption[]; shifts: ShiftOption[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = cls.teachers[0]?.id ?? "";

  function changeTeacher(teacherId: string) {
    setError(null);
    startTransition(async () => {
      const res = await assignClassTeacher(cls.id, teacherId || null);
      if (!res.ok) setError(res.error);
    });
  }

  function changeShift(shiftId: string) {
    setError(null);
    startTransition(async () => {
      const res = await assignClassShift(cls.id, shiftId || null);
      if (!res.ok) setError(res.error);
    });
  }

  async function remove() {
    if (!(await confirmSheet({ title: `Xoá lớp ${cls.name}?`, confirmLabel: "Xoá lớp", tone: "danger" }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteClass(cls.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className={cn("space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", pending && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold">Lớp {cls.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <MapPin className="size-3.5" /> {CAMPUS_LABELS[cls.campus]}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-700">
            <Users className="size-4" /> {cls.studentCount}
            <span className="sr-only">học sinh</span>
          </span>
          {cls.studentCount === 0 && (
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={remove} disabled={pending} aria-label={`Xoá lớp ${cls.name}`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <Field label="Giáo viên phụ trách" htmlFor={`teacher-${cls.id}`}>
        <div className="relative">
          <select
            id={`teacher-${cls.id}`}
            className={fieldClass}
            value={current}
            disabled={pending}
            onChange={(e) => changeTeacher(e.target.value)}
          >
            <option value="">— Chưa phân công —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || "(Chưa có tên)"}
              </option>
            ))}
          </select>
          {pending && <Loader2 className="absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </Field>
      <Field label="Ca học" htmlFor={`shift-${cls.id}`}>
        <ShiftSelect id={`shift-${cls.id}`} shifts={shifts} value={cls.shift_id ?? ""} disabled={pending} onChange={changeShift} />
      </Field>
      {cls.campusTeachers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Phụ trách cả cơ sở: {cls.campusTeachers.map((t) => t.full_name).join(", ")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

export function ClassManager({ classes, teachers, shifts }: { classes: ClassRow[]; teachers: PersonOption[]; shifts: ShiftOption[] }) {
  return (
    <div className="space-y-5">
      <CreateClassForm teachers={teachers} shifts={shifts} />
      <Link
        href="/admin/accounts?role=teacher"
        className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-colors hover:bg-muted/50"
      >
        <UserPlus className="size-5 text-indigo-600" />
        <span className="flex-1">
          <span className="block font-bold">Chưa có giáo viên trong danh sách?</span>
          <span className="block text-xs text-muted-foreground">Tạo tài khoản giáo viên ở trang Tài khoản</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Danh sách lớp ({classes.length})</h2>
        {classes.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Chưa có lớp nào. Hãy tạo lớp đầu tiên ở trên.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {classes.map((c) => (
              <ClassCard key={c.id} cls={c} teachers={teachers} shifts={shifts} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
