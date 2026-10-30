import { redirect } from "next/navigation";
import { getAuthContext } from "@/features/auth/queries";
import { ADMIN_LOGIN_PATH, ROLE_HOME } from "@/lib/auth/routes";

/** Fallback nếu middleware không xử lý: đã đăng nhập → dashboard theo vai trò; chưa → trang quản trị. */
export default async function HomePage() {
  const ctx = await getAuthContext();
  redirect(ctx ? ROLE_HOME[ctx.profile.role] : ADMIN_LOGIN_PATH);
}
