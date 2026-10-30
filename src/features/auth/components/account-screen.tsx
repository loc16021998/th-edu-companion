import { Mail, MapPin, Phone, UserRound } from "lucide-react";
import { CAMPUS_LABELS, ROLE_LABELS } from "@/config/constants";
import type { AuthContext } from "../queries";
import { ChangePasswordForm } from "./change-password-form";

function displayPhone(phone: string | null | undefined) {
  if (!phone) return null;
  return phone.replace(/^\+?84/, "0").replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");
}

/** "Tài khoản của tôi" — thông tin đăng nhập + đổi mật khẩu. Dùng chung cho quản trị, giáo viên, phụ huynh. */
export function AccountScreen({ ctx }: { ctx: AuthContext }) {
  const { profile, user } = ctx;
  const phone = displayPhone(user.phone || profile.phone);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-extrabold">Tài khoản của tôi</h1>

      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-lg font-bold">{profile.full_name || "Người dùng"}</p>
            <p className="text-sm text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {phone && (
            <li className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" /> {phone}
            </li>
          )}
          {user.email && (
            <li className="flex items-center gap-2 break-all">
              <Mail className="size-4 shrink-0 text-muted-foreground" /> {user.email}
            </li>
          )}
          {profile.campus && (
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" /> {CAMPUS_LABELS[profile.campus]}
            </li>
          )}
        </ul>
        <p className="text-xs text-muted-foreground">Cần sửa họ tên / số điện thoại? Vui lòng liên hệ quản trị viên trung tâm.</p>
      </section>

      <ChangePasswordForm />

      <p className="text-center text-xs text-muted-foreground">
        Quên mật khẩu hiện tại? Liên hệ quản trị viên nhà trường để được cấp lại mật khẩu.
      </p>
    </div>
  );
}
