import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginShell } from "@/features/auth/components/login-shell";
import { LOGIN_NOTICES } from "@/features/auth/errors";
import { TEACHER_LOGIN_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Đăng nhập phụ huynh" };

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

export default async function ParentLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Chỉ nhận ?next= trong khu /parent — tránh chuyển nhầm sang khu vai trò khác
  const next = typeof params.next === "string" && (params.next === "/parent" || params.next.startsWith("/parent/")) ? params.next : undefined;
  const notice = typeof params.error === "string" ? LOGIN_NOTICES[params.error] : undefined;

  return (
    <LoginShell
      icon={UsersRound}
      audience="Phụ huynh"
      title="Đăng nhập Phụ huynh"
      description="Theo dõi học tập, lịch học, chuyên cần và học phí của con."
      band="bg-gradient-to-br from-primary to-[#1b6f48]"
      backdrop="md:bg-gradient-to-br md:from-accent md:via-background md:to-accent"
      switchLink={{ href: TEACHER_LOGIN_PATH, question: "Bạn là giáo viên?", label: "Đăng nhập Giáo viên" }}
    >
      <LoginForm next={next} notice={notice} portals={["parent"]} />
    </LoginShell>
  );
}
