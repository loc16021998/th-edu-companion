"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loginPathForRole, resolvePostLoginPath } from "@/lib/auth/routes";
import { env } from "@/lib/env";
import { formDataToObject, formError, formSuccess, zodFormError, type FormState } from "@/lib/form-state";
import { currentIp, rateLimit, rateLimitPeek, resetRateLimit, retryAfterText } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/types/action-result";
import type { Tables } from "@/types/database.types";
import { getLoginErrorMessage } from "./errors";
import { getAuthContext } from "./queries";
import { SELECTED_CHILD_COOKIE } from "@/features/parent/selected-child";
import { changePasswordSchema, loginSchema, type LoginPortal } from "./schema";

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

const WRONG_PORTAL_MESSAGE: Record<LoginPortal, string> = {
  parent: "Đây là tài khoản phụ huynh. Vui lòng chọn mục “Phụ huynh” để đăng nhập.",
  staff: "Đây là tài khoản giáo viên. Vui lòng chọn mục “Giáo viên” để đăng nhập.",
  admin: "Đây là tài khoản quản trị viên. Vui lòng đăng nhập tại trang Quản trị.",
};

export type LoginState = {
  error?: string;
  /** Đăng nhập sai mục (vd. tài khoản giáo viên ở mục Phụ huynh) → gợi ý mục đúng */
  suggestPortal?: LoginPortal;
  fieldErrors?: Partial<Record<"identifier" | "password", string>>;
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier") ?? "",
    password: formData.get("password") ?? "",
    portal: formData.get("portal") ?? "parent",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    return {
      fieldErrors: { identifier: fieldErrors.identifier?.[0], password: fieldErrors.password?.[0] },
    };
  }

  const { identifier, password, next, portal } = parsed.data;
  let destination: string;

  // Chống dò mật khẩu: khoá tạm theo tài khoản và theo IP khi nhập sai quá nhiều lần.
  // Kiểm tra TRƯỚC khi gọi Supabase → đang bị khoá thì kể cả mật khẩu đúng cũng không được xác nhận.
  const account = identifier.type === "email" ? `email:${identifier.email.toLowerCase()}` : `phone:${identifier.phone}`;
  const ip = await currentIp();
  const [accountGate, ipGate] = await Promise.all([rateLimitPeek("loginAccount", account), rateLimitPeek("loginIp", ip)]);
  if (!accountGate.ok || !ipGate.ok) {
    const wait = Math.max(accountGate.retryAfter, ipGate.retryAfter);
    return { error: `Bạn đã nhập sai quá nhiều lần. Vì lý do bảo mật, vui lòng thử lại sau ${retryAfterText(wait)}.` };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(
      identifier.type === "email"
        ? { email: identifier.email, password }
        : { phone: identifier.phone, password },
    );
    if (error) {
      const [afterAccount] = await Promise.all([rateLimit("loginAccount", account), rateLimit("loginIp", ip)]);
      const message = getLoginErrorMessage(error, identifier.type);
      // Cảnh báo trước khi bị khoá (remaining = số lần còn được thử)
      if (afterAccount.ok && afterAccount.remaining === 0) {
        return { error: `${message} Bạn đã nhập sai quá nhiều lần — tạm khoá đăng nhập 15 phút.` };
      }
      if (afterAccount.ok && afterAccount.remaining <= 2) {
        return { error: `${message} Còn ${afterAccount.remaining} lần thử trước khi bị tạm khoá 15 phút.` };
      }
      return { error: message };
    }
    await resetRateLimit("loginAccount", account);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      // Không để lại session "mồ côi" không có quyền gì
      await supabase.auth.signOut({ scope: "local" });
      return {
        error: profileError
          ? "Không tải được hồ sơ người dùng. Vui lòng thử lại."
          : "Tài khoản chưa được nhà trường cấp quyền truy cập. Vui lòng liên hệ quản trị viên.",
      };
    }

    // Tài khoản đúng nhưng chọn sai mục → không đăng nhập, gợi ý chuyển mục
    const accountPortal: LoginPortal = profile.role === "parent" ? "parent" : profile.role === "teacher" ? "staff" : "admin";
    if (accountPortal !== portal) {
      await supabase.auth.signOut({ scope: "local" });
      return { suggestPortal: accountPortal, error: WRONG_PORTAL_MESSAGE[accountPortal] };
    }

    destination = resolvePostLoginPath(profile.role, next);
  } catch (err) {
    console.error("[auth] login thất bại:", err);
    return { error: "Đã có lỗi xảy ra. Vui lòng thử lại sau." };
  }

  // redirect() hoạt động bằng cách throw — phải gọi NGOÀI try/catch
  redirect(destination);
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  // Quản trị viên quay về trang đăng nhập quản trị, phụ huynh/giáo viên về /login
  const ctx = await getAuthContext().catch(() => null);
  const destination = loginPathForRole(ctx?.profile.role ?? "parent");
  try {
    const supabase = await createClient();
    // scope "local": chỉ đăng xuất thiết bị hiện tại
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.error("[auth] signOut trả về lỗi:", error);
    // Bỏ lựa chọn "bé đang xem" — máy dùng chung, người đăng nhập sau không thấy lựa chọn của gia đình trước
    (await cookies()).delete(SELECTED_CHILD_COOKIE);
  } catch (err) {
    console.error("[auth] logout thất bại:", err);
  }
  redirect(destination);
}

// ---------------------------------------------------------------------------
// getCurrentUserWithProfile — gọi được từ Client Component
// (Server Component nên dùng trực tiếp getAuthContext() trong ./queries)
// ---------------------------------------------------------------------------

export type CurrentUser = {
  id: string;
  email: string | null;
  phone: string | null;
  profile: Tables<"profiles">;
};

export async function getCurrentUserWithProfile(): Promise<ActionResult<CurrentUser | null>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        id: ctx.user.id,
        email: ctx.user.email ?? null,
        phone: ctx.user.phone || null,
        profile: ctx.profile,
      },
    };
  } catch (err) {
    console.error("[auth] getCurrentUserWithProfile thất bại:", err);
    return { ok: false, error: "Không tải được thông tin người dùng. Vui lòng thử lại." };
  }
}

// ---------------------------------------------------------------------------
// changePassword — người dùng (quản trị / giáo viên / phụ huynh) tự đổi mật khẩu
// ---------------------------------------------------------------------------

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFormError(parsed.error);
  const { currentPassword, newPassword, signOutOthers } = parsed.data;

  const ctx = await getAuthContext();
  if (!ctx) return formError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  const { user } = ctx;

  // Phiên bị lộ cũng không dò được mật khẩu hiện tại
  const gate = await rateLimit("changePassword", user.id);
  if (!gate.ok) return formError(`Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${retryAfterText(gate.retryAfter)}.`);

  try {
    // 1. Xác minh mật khẩu hiện tại bằng client tạm (không ghi cookie, không đụng phiên đang dùng)
    const verifier = createStatelessClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const credentials = user.email
      ? { email: user.email, password: currentPassword }
      : user.phone
        ? { phone: user.phone.startsWith("+") ? user.phone : `+${user.phone}`, password: currentPassword }
        : null;
    if (!credentials) return formError("Tài khoản chưa có email hoặc số điện thoại. Vui lòng liên hệ nhà trường.");

    const { error: verifyError } = await verifier.auth.signInWithPassword(credentials);
    if (verifyError) {
      if (verifyError.code === "invalid_credentials") {
        return formError("Mật khẩu hiện tại không đúng.", { currentPassword: "Mật khẩu hiện tại không đúng" });
      }
      return formError(getLoginErrorMessage(verifyError, user.email ? "email" : "phone"));
    }
    // Thu hồi phiên tạm vừa tạo để xác minh
    await verifier.auth.signOut({ scope: "local" });

    // 2. Đổi mật khẩu trên phiên hiện tại
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("[auth] updateUser(password) lỗi:", error);
      if (error.code === "weak_password") return formError("Mật khẩu mới quá yếu. Hãy dùng chữ hoa, chữ thường và số.", { newPassword: "Mật khẩu quá yếu" });
      if (error.code === "same_password") return formError("Mật khẩu mới phải khác mật khẩu hiện tại.", { newPassword: "Trùng mật khẩu cũ" });
      if (error.code === "reauthentication_needed") return formError("Vui lòng đăng xuất, đăng nhập lại rồi đổi mật khẩu.");
      return formError("Không đổi được mật khẩu. Vui lòng thử lại.");
    }

    // 3. Tuỳ chọn: đăng xuất các thiết bị khác (giữ thiết bị đang dùng)
    if (signOutOthers) {
      const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
      if (othersError) console.error("[auth] signOut(others) lỗi:", othersError);
    }
  } catch (err) {
    console.error("[auth] changePassword thất bại:", err);
    return formError("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }

  return formSuccess(
    signOutOthers ? "Đã đổi mật khẩu và đăng xuất khỏi các thiết bị khác." : "Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.",
  );
}
