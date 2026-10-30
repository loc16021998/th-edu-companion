import type { Metadata } from "next";
import { listClasses, listStudentsWithParents } from "@/features/admin/queries";
import { listAnnouncements } from "@/features/center/queries";
import { AnnouncementManager, type AudienceParent } from "@/features/center/components/announcement-manager";
import type { Campus } from "@/features/center/constants";

export const metadata: Metadata = { title: "Truyền thông trung tâm" };

export default async function AnnouncementsPage() {
  const [announcements, classes, students] = await Promise.all([listAnnouncements(), listClasses(), listStudentsWithParents()]);

  // Ước tính số phụ huynh nhận: gom theo phụ huynh (1 phụ huynh nhiều con chỉ tính 1)
  const classIdOf = new Map(classes.map((c) => [`${c.campus}:${c.name}`, c.id]));
  const byParent = new Map<string, { campuses: Set<Campus>; classIds: Set<string> }>();
  for (const s of students) {
    if (!s.parent_id) continue;
    const entry = byParent.get(s.parent_id) ?? { campuses: new Set(), classIds: new Set() };
    entry.campuses.add(s.campus);
    const id = classIdOf.get(`${s.campus}:${s.class_name}`);
    if (id) entry.classIds.add(id);
    byParent.set(s.parent_id, entry);
  }
  const parents: AudienceParent[] = [...byParent.values()].map((p) => ({ campuses: [...p.campuses], classIds: [...p.classIds] }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Truyền thông trung tâm</h1>
        <p className="text-sm text-muted-foreground">Đăng thông báo chung: lịch nghỉ lễ, sân chơi cuộc thi luyện chữ, chương trình ngoại khoá… Phụ huynh nhận ngay trên chuông thông báo.</p>
      </div>
      {!announcements.available ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Database chưa có bảng thông báo — chạy file <code>supabase/apply-admin-center.sql</code> trong Supabase SQL Editor.
        </p>
      ) : (
        <AnnouncementManager
          items={announcements.items}
          classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name }))}
          parents={parents}
        />
      )}
    </div>
  );
}
