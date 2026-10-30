import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, UserCog, Wallet, type LucideIcon } from "lucide-react";
import { addMonths, isISODate, startOfMonth, todayVN } from "@/lib/date";
import { cn } from "@/lib/utils";
import { listClasses, listProfilesByRole, listStudentsWithParents } from "@/features/admin/queries";
import { StudentManager } from "@/features/admin/components/student-manager";
import { getFeeGeneratorData, listTeachersForManagement } from "@/features/center/queries";
import { TeacherManager } from "@/features/center/components/teacher-manager";
import { FeeGenerator } from "@/features/center/components/fee-generator";

export const metadata: Metadata = { title: "Quản lý tài khoản & phân lớp" };

const TABS: { key: "teachers" | "students" | "fees"; label: string; icon: LucideIcon }[] = [
  { key: "teachers", label: "Giáo viên", icon: UserCog },
  { key: "students", label: "Học sinh", icon: GraduationCap },
  { key: "fees", label: "Học phí", icon: Wallet },
];
type Tab = (typeof TABS)[number]["key"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ManagementPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "teachers";
  const today = todayVN();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Quản lý tài khoản & phân lớp</h1>
        <p className="text-sm text-muted-foreground">Giáo viên, học sinh – phụ huynh và phát hành học phí cho CS1 Xa La & CS2 Ngô Thì Nhậm.</p>
      </div>

      <nav aria-label="Mục quản lý" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin/management?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
              tab === key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      {tab === "teachers" && <TeachersTab />}
      {tab === "students" && <StudentsTab today={today} />}
      {tab === "fees" && <FeesTab today={today} monthParam={params.month} />}
    </div>
  );
}

async function TeachersTab() {
  const [teachers, classes] = await Promise.all([listTeachersForManagement(), listClasses()]);
  return (
    <TeacherManager
      teachers={teachers}
      classes={classes.map((c) => ({ id: c.id, campus: c.campus, name: c.name, studentCount: c.studentCount }))}
    />
  );
}

async function StudentsTab({ today }: { today: string }) {
  const [classes, parents, students] = await Promise.all([listClasses(), listProfilesByRole("parent"), listStudentsWithParents()]);
  return <StudentManager classes={classes} parents={parents} students={students} today={today} />;
}

async function FeesTab({ today, monthParam }: { today: string; monthParam: string | string[] | undefined }) {
  const current = startOfMonth(today);
  const monthOptions = [-1, 0, 1, 2].map((d) => addMonths(current, d));
  const month = isISODate(monthParam) && monthOptions.includes(startOfMonth(monthParam)) ? startOfMonth(monthParam) : current;
  const data = await getFeeGeneratorData(month);

  if (!data.available) {
    return (
      <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Database chưa cập nhật cho tính năng tạo học phí tháng — chạy file <code>supabase/apply-admin-center.sql</code> trong Supabase SQL Editor.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <FeeGenerator key={month} month={month} monthOptions={monthOptions} classes={data.classes} />
      <p className="text-center text-sm text-muted-foreground">
        Ghi nhận phụ huynh đã đóng tiền, tạo khoản thu lẻ ở trang{" "}
        <Link href="/admin/fees" className="font-semibold text-primary hover:underline">
          Học phí
        </Link>
        .
      </p>
    </div>
  );
}
