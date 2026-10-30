import type { Metadata } from "next";
import { getAuthContext, requireRole } from "@/features/auth/queries";
import { AccountScreen } from "@/features/auth/components/account-screen";
import { PushOptIn } from "@/features/push/components/push-opt-in";

export const metadata: Metadata = { title: "Tài khoản của tôi" };

export default async function AccountPage() {
  await requireRole("teacher");
  const ctx = await getAuthContext(); // đã cache trong request — requireRole bảo đảm khác null
  if (!ctx) return null;
  return (
    <div className="space-y-5">
      <AccountScreen ctx={ctx} />
      {/* Thông báo đẩy trên thiết bị đang dùng */}
      <PushOptIn />
    </div>
  );
}
