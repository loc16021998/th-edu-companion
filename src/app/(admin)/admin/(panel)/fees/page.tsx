import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listAllFees, listClasses, listStudentsWithParents } from "@/features/admin/queries";
import { FeeManager } from "@/features/admin/components/fee-manager";

export const metadata: Metadata = { title: "Học phí" };

export default async function AdminFeesPage() {
  const [classes, students, fees] = await Promise.all([listClasses(), listStudentsWithParents(), listAllFees()]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Học phí</h1>
      <FeeManager classes={classes} students={students} fees={fees} today={todayVN()} />
    </div>
  );
}
