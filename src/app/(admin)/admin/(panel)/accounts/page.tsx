import type { Metadata } from "next";
import { listAccounts } from "@/features/admin/queries";
import { AccountManager } from "@/features/admin/components/account-manager";

export const metadata: Metadata = { title: "Tài khoản" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const accounts = await listAccounts();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Tài khoản</h1>
        <p className="text-sm text-muted-foreground">Nhà trường cấp tài khoản đăng nhập cho phụ huynh và giáo viên.</p>
      </div>
      <AccountManager
        accounts={accounts}
        initialRole={params.role === "teacher" ? "teacher" : "parent"}
        canManage={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
      />
    </div>
  );
}
