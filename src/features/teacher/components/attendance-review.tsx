"use client";

import { useState } from "react";
import { CircleCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { ATTENDANCE_STYLE } from "@/config/ui-styles";
import { countAttendance } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import { AttendanceForm } from "./attendance-form";

type Status = Enums<"attendance_status">;
type Student = { id: string; full_name: string; avatar_url: string | null };

/**
 * Điểm danh dạng CHỈ XEM (khu quản trị) + nút "Sửa điểm danh" để mở form chỉnh.
 * Lưu xong / Huỷ → quay lại chế độ xem.
 */
export function AttendanceReview({
  date,
  students,
  saved,
}: {
  date: string;
  students: Student[];
  saved: Record<string, { status: Status; note: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (editing) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          <Pencil className="size-4 shrink-0" /> Đang sửa điểm danh — bấm “Lưu điểm danh” để lưu, hoặc “Huỷ” để bỏ thay đổi.
        </p>
        <AttendanceForm
          date={date}
          students={students}
          saved={saved}
          onSaved={(text) => {
            setFlash(text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const counts = countAttendance(students.flatMap((s) => (saved[s.id]?.status ? [saved[s.id]!.status] : [])));
  const marked = counts.present + counts.late + counts.absent + counts.absent_with_permission;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Có mặt {counts.present}</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Muộn {counts.late}</span>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Vắng {counts.absent}</span>
        {counts.absent_with_permission > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">Có phép {counts.absent_with_permission}</span>
        )}
        <span className="text-xs font-medium text-muted-foreground">
          · Đã điểm danh {marked}/{students.length}
        </span>
        <Button
          type="button"
          size="sm"
          className="ml-auto rounded-full"
          onClick={() => {
            setFlash(null);
            setEditing(true);
          }}
        >
          <Pencil /> Sửa điểm danh
        </Button>
      </div>

      {flash && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-600 p-3 text-sm font-medium text-white">
          <CircleCheck className="size-4 shrink-0" /> {flash}
        </p>
      )}
      {marked === 0 && (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Giáo viên chưa điểm danh lớp này trong ngày đã chọn. Bấm “Sửa điểm danh” nếu cần điểm danh thay.
        </p>
      )}

      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {students.map((student, i) => {
          const record = saved[student.id];
          const style = ATTENDANCE_STYLE[record?.status ?? "none"];
          const Icon = style.icon;
          return (
            <li key={student.id} className="flex items-center gap-3 p-3">
              <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              <StudentAvatar student={student} className="size-9 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{student.full_name}</p>
                {record?.note && <p className="break-words text-xs text-muted-foreground">Ghi chú: {record.note}</p>}
              </div>
              <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1", style.badge)}>
                <Icon className="size-3.5" />
                {record ? style.label : "Chưa điểm danh"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
