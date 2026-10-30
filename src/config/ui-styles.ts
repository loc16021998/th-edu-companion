// Cấu hình hiển thị (màu, icon, emoji) dùng chung cho Parent & Teacher Portal.
import {
  BookOpen,
  Brain,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  GraduationCap,
  type LucideIcon,
  NotebookPen,
  PenLine,
  Pencil,
  Receipt,
  CalendarCheck,
} from "lucide-react";
import { ATTENDANCE_LABELS, FEE_STATUS_LABELS, MOOD_LABELS, type SubjectKey } from "@/config/constants";
import type { Enums } from "@/types/database.types";

type AttendanceKey = Enums<"attendance_status"> | "none";

export const ATTENDANCE_STYLE: Record<
  AttendanceKey,
  { label: string; icon: LucideIcon; badge: string; card: string; cell: string }
> = {
  present: {
    label: ATTENDANCE_LABELS.present,
    icon: CircleCheck,
    badge: "bg-green-100 text-green-800 ring-green-200",
    card: "bg-green-50 text-green-800 ring-green-200",
    cell: "bg-green-200 text-green-900",
  },
  late: {
    label: ATTENDANCE_LABELS.late,
    icon: Clock,
    badge: "bg-amber-100 text-yellow-800 ring-amber-200",
    card: "bg-amber-50 text-yellow-800 ring-amber-200",
    cell: "bg-amber-200 text-yellow-900",
  },
  absent: {
    label: ATTENDANCE_LABELS.absent,
    icon: CircleX,
    badge: "bg-rose-100 text-rose-800 ring-rose-200",
    card: "bg-rose-50 text-rose-800 ring-rose-200",
    cell: "bg-rose-200 text-rose-900",
  },
  absent_with_permission: {
    label: ATTENDANCE_LABELS.absent_with_permission,
    icon: CalendarCheck,
    badge: "bg-sky-100 text-sky-800 ring-sky-200",
    card: "bg-sky-50 text-sky-800 ring-sky-200",
    cell: "bg-sky-200 text-sky-900",
  },
  none: {
    label: "Chưa điểm danh",
    icon: CircleDashed,
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    card: "bg-slate-50 text-slate-600 ring-slate-100",
    cell: "bg-slate-100 text-slate-500",
  },
};

export const MOOD_STYLE: Record<Enums<"mood">, { emoji: string; label: string; card: string }> = {
  happy: { emoji: "😄", label: MOOD_LABELS.happy, card: "bg-yellow-50 text-yellow-800 ring-yellow-100" },
  focused: { emoji: "🤓", label: MOOD_LABELS.focused, card: "bg-sky-50 text-sky-800 ring-sky-100" },
  neutral: { emoji: "🙂", label: MOOD_LABELS.neutral, card: "bg-violet-50 text-violet-800 ring-violet-100" },
  tired: { emoji: "😴", label: MOOD_LABELS.tired, card: "bg-orange-50 text-orange-800 ring-orange-100" },
};

export const SUBJECT_STYLE: Record<SubjectKey, { icon: LucideIcon; bubble: string }> = {
  tien_tieu_hoc: { icon: BookOpen, bubble: "bg-edu-leaf-100 text-edu-leaf-800" },
  luyen_chu: { icon: PenLine, bubble: "bg-edu-blue-100 text-edu-blue-700" },
  toan_tu_duy: { icon: Brain, bubble: "bg-edu-peach-100 text-edu-peach-800" },
};

export const FEE_STATUS_STYLE: Record<Enums<"fee_status">, { label: string; badge: string }> = {
  paid: { label: FEE_STATUS_LABELS.paid, badge: "bg-green-100 text-green-800 ring-green-200" },
  partial: { label: FEE_STATUS_LABELS.partial, badge: "bg-amber-100 text-yellow-800 ring-amber-200" },
  unpaid: { label: FEE_STATUS_LABELS.unpaid, badge: "bg-rose-100 text-rose-800 ring-rose-200" },
};

/** Icon cho khoản thu, đoán theo tiêu đề. */
export function feeIcon(title: string): { icon: LucideIcon; bubble: string } {
  const t = title.toLowerCase();
  if (t.includes("học phí")) return { icon: GraduationCap, bubble: "bg-sky-100 text-sky-600" };
  if (t.includes("giáo trình") || t.includes("sách")) return { icon: NotebookPen, bubble: "bg-violet-100 text-violet-600" };
  if (t.includes("dụng cụ") || t.includes("đồ dùng")) return { icon: Pencil, bubble: "bg-amber-100 text-amber-600" };
  return { icon: Receipt, bubble: "bg-slate-100 text-slate-600" };
}
