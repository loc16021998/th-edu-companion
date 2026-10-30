import type { Metadata } from "next";
import { todayVN } from "@/lib/date";
import { listClasses, listProfilesByRole } from "@/features/admin/queries";
import { listLeads, listTrials } from "@/features/admissions/queries";
import { TrialsManager } from "@/features/admissions/components/trials-manager";
import { AdmissionsMigrationNotice } from "@/features/admissions/components/admissions-migration-notice";
import { AdminFeedMarkRead } from "@/features/admin-feed/components/admin-feed-mark-read";

export const metadata: Metadata = { title: "Lịch học thử" };

export default async function TrialsPage() {
  const [trials, leads, classes, teachers] = await Promise.all([listTrials(), listLeads(), listClasses(), listProfilesByRole("teacher")]);
  if (!trials.available || !leads.available) return <AdmissionsMigrationNotice />;

  return (
    <>
      {/* Đã mở trang → thông báo "giáo viên đã đánh giá" không còn hiện là mới */}
      <AdminFeedMarkRead category="admissions" />
      <TrialsManager
        trials={trials.items}
        leads={leads.items
          .filter((l) => l.status !== "enrolled" && l.status !== "lost")
          .map((l) => ({ id: l.id, full_name: l.full_name, parent_name: l.parent_name, campus: l.campus, target_program: l.target_program }))}
        classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name, teachers: c.teachers, campusTeachers: c.campusTeachers }))}
        teachers={teachers.map((t) => ({ id: t.id, full_name: t.full_name, campus: t.campus }))}
        now={Date.now()}
        today={todayVN()}
      />
    </>
  );
}
