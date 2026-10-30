import type { Metadata } from "next";
import { getPaySettings } from "@/features/teaching/queries";
import { ClassMetaList, PayRatesForm } from "@/features/teaching/components/pay-settings";
import { PayrollMigrationNotice } from "@/features/teaching/components/payroll-migration-notice";

export const metadata: Metadata = { title: "Đơn giá lương" };

export default async function PaySettingsPage() {
  const settings = await getPaySettings();
  if (!settings.available) return <PayrollMigrationNotice />;
  return (
    <div className="space-y-6">
      <PayRatesForm rates={settings.rates} teachers={settings.teachers} />
      <ClassMetaList classes={settings.classes} />
    </div>
  );
}
