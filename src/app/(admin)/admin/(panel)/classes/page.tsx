import type { Metadata } from "next";
import { shiftScheduleLabel } from "@/lib/shifts";
import { listClasses, listProfilesByRole } from "@/features/admin/queries";
import { ClassManager, type ShiftOption } from "@/features/admin/components/class-manager";
import { listShifts } from "@/features/shifts/queries";

export const metadata: Metadata = { title: "Lớp học" };

export default async function AdminClassesPage() {
  const [classes, teachers, shiftList] = await Promise.all([listClasses(), listProfilesByRole("teacher"), listShifts()]);
  const shifts: ShiftOption[] = shiftList.items.map((s) => ({ id: s.id, name: s.name, label: shiftScheduleLabel(s), is_active: s.is_active }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Lớp học</h1>
      <ClassManager classes={classes} teachers={teachers} shifts={shifts} />
    </div>
  );
}
