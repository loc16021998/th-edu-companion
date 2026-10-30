import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listClasses, listProfilesByRole, listStudentsWithParents } from "@/features/admin/queries";
import { StudentManager } from "@/features/admin/components/student-manager";

export const metadata: Metadata = { title: "Học sinh" };

export default async function AdminStudentsPage() {
  const [classes, parents, students] = await Promise.all([
    listClasses(),
    listProfilesByRole("parent"),
    listStudentsWithParents(),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Học sinh</h1>
      <StudentManager classes={classes} parents={parents} students={students} today={todayVN()} />
    </div>
  );
}
