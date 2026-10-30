import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAccounts } from "@/features/admin/queries";
import { PasswordResetList } from "@/features/admin/components/password-reset-list";

type Params = Promise<{ role: string }>;

const PAGES = {
  parent: { title: "Đổi mật khẩu phụ huynh", description: "Đặt mật khẩu mới cho tài khoản phụ huynh (khi phụ huynh quên mật khẩu)." },
  teacher: { title: "Đổi mật khẩu giáo viên", description: "Đặt mật khẩu mới cho tài khoản giáo viên (khi giáo viên quên mật khẩu)." },
} as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { role } = await params;
  return { title: role in PAGES ? PAGES[role as keyof typeof PAGES].title : "Đổi mật khẩu" };
}

export default async function AdminPasswordsPage({ params }: { params: Params }) {
  const { role } = await params;
  if (role !== "parent" && role !== "teacher") notFound();

  const accounts = (await listAccounts()).filter((a) => a.role === role);
  const page = PAGES[role];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">{page.title}</h1>
        <p className="text-sm text-muted-foreground">
          {page.description} {accounts.length} tài khoản.
        </p>
      </div>
      <PasswordResetList role={role} accounts={accounts} canManage={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
    </div>
  );
}
