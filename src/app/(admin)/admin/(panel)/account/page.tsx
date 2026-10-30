import type { Metadata } from "next";
import { getAuthContext, requireRole } from "@/features/auth/queries";
import { AccountScreen } from "@/features/auth/components/account-screen";

export const metadata: Metadata = { title: "Tài khoản của tôi" };

export default async function AccountPage() {
  await requireRole("admin");
  const ctx = await getAuthContext(); // đã cache trong request — requireRole bảo đảm khác null
  return ctx ? <AccountScreen ctx={ctx} /> : null;
}
