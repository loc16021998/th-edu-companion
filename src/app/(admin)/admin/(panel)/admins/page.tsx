import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/features/auth/queries";
import { listAdminAccounts, type AdminRow } from "@/features/admin/accounts";
import { AdminAccountsManager } from "@/features/admin/components/admin-accounts-manager";

export const metadata: Metadata = { title: "Tài khoản quản trị" };

/** Chỉ quản trị viên vào được (middleware + requireRole). Khu phụ huynh / giáo viên không có chức năng này. */
export default async function AdminAdminsPage() {
  await connection();
  const profile = await requireRole("admin");
  const canManage = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const admins: AdminRow[] = canManage ? await listAdminAccounts() : [{ id: profile.id, full_name: profile.full_name, phone: profile.phone, email: null, created_at: profile.created_at }];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Tài khoản quản trị</h1>
        <p className="text-sm text-muted-foreground">Cấp và thu hồi tài khoản quản trị viên. Mỗi thao tác cần nhập lại mật khẩu của bạn và được ghi vào Nhật ký & bảo mật.</p>
      </div>
      <AdminAccountsManager admins={admins} meId={profile.id} canManage={canManage} />
    </div>
  );
}
