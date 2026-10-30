import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginShell } from "@/features/auth/components/login-shell";
import { LOGIN_NOTICES } from "@/features/auth/errors";
import { PARENT_LOGIN_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Đăng nhập giáo viên" };

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

export default async function TeacherLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Chỉ nhận ?next= trong khu /teacher — tránh chuyển nhầm sang khu vai trò khác
  const next = typeof params.next === "string" && (params.next === "/teacher" || params.next.startsWith("/teacher/")) ? params.next : undefined;
  const notice = typeof params.error === "string" ? LOGIN_NOTICES[params.error] : undefined;

  return (
    <LoginShell
      icon={GraduationCap}
      audience="Giáo viên"
      title="Đăng nhập Giáo viên"
      description="Điểm danh, viết sổ liên lạc cho lớp phụ trách."
      band="bg-gradient-to-br from-sky-500 to-indigo-600"
      backdrop="md:bg-gradient-to-br md:from-sky-50 md:via-background md:to-indigo-50"
      switchLink={{ href: PARENT_LOGIN_PATH, question: "Bạn là phụ huynh?", label: "Đăng nhập Phụ huynh" }}
    >
      <LoginForm next={next} notice={notice} portals={["staff"]} submitClassName="bg-indigo-600 hover:bg-indigo-600/90 focus-visible:ring-indigo-500" />
    </LoginShell>
  );
}
