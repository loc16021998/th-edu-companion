import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listClasses, listProfilesByRole } from "@/features/admin/queries";
import { listLeads } from "@/features/admissions/queries";
import { AdmissionsBoard } from "@/features/admissions/components/admissions-board";
import { AdmissionsMigrationNotice } from "@/features/admissions/components/admissions-migration-notice";

export const metadata: Metadata = { title: "Tuyển sinh" };

export default async function AdmissionsPage() {
  const [leads, classes, teachers, admins] = await Promise.all([listLeads(), listClasses(), listProfilesByRole("teacher"), listProfilesByRole("admin")]);
  if (!leads.available) return <AdmissionsMigrationNotice />;

  return (
    <AdmissionsBoard
      leads={leads.items}
      today={todayVN()}
      classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name, monthly_fee: c.monthly_fee, teachers: c.teachers, campusTeachers: c.campusTeachers }))}
      teachers={teachers.map((t) => ({ id: t.id, full_name: t.full_name, campus: t.campus }))}
      consultants={admins.map((a) => ({ id: a.id, full_name: a.full_name }))}
    />
  );
}
