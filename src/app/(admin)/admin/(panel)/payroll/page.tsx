import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listClasses } from "@/features/admin/queries";
import { getPayroll } from "@/features/teaching/queries";
import { isMonth } from "@/features/teaching/constants";
import { PayrollDashboard } from "@/features/teaching/components/payroll-dashboard";
import { PayrollMigrationNotice } from "@/features/teaching/components/payroll-migration-notice";

export const metadata: Metadata = { title: "Lương giáo viên" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PayrollPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = isMonth(params.month) ? params.month : todayVN().slice(0, 7);
  const [payroll, classes] = await Promise.all([getPayroll(month), listClasses()]);
  if (!payroll.available) return <PayrollMigrationNotice />;

  return (
    <PayrollDashboard
      key={month}
      month={month}
      rows={payroll.rows}
      sessions={payroll.sessions}
      classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name }))}
    />
  );
}
