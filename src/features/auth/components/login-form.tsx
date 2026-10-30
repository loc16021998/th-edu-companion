"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRightLeft, Eye, EyeOff, GraduationCap, Info, Loader2, LockKeyhole, Mail, Phone, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_LOGIN_PATH, PARENT_LOGIN_PATH, TEACHER_LOGIN_PATH } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";
import { login, type LoginState } from "@/features/auth/actions";
import type { LoginPortal } from "@/features/auth/schema";

const PORTAL_KEY = "th-edu:login-portal";

const PORTALS: Record<LoginPortal, { label: string; icon: LucideIcon; hint: string }> = {
  parent: {
    label: "Phụ huynh",
    icon: UsersRound,
    hint: "Theo dõi điểm danh, nhận xét và học phí của con.",
  },
  staff: {
    label: "Giáo viên",
    icon: GraduationCap,
    hint: "Điểm danh, nhận xét tình hình học tập của các bạn học sinh",
  },
  admin: {
    label: "Quản trị",
    icon: ShieldCheck,
    hint: "Dành riêng cho quản trị viên trung tâm.",
  },
};

/** Mục nằm ở trang đăng nhập khác → hiện liên kết sang trang đó thay vì đổi tab. */
function portalHref(portal: LoginPortal) {
  return { admin: ADMIN_LOGIN_PATH, staff: TEACHER_LOGIN_PATH, parent: PARENT_LOGIN_PATH }[portal];
}

const INITIAL_STATE: LoginState = {};

export function LoginForm({
  next,
  notice,
  initialPortal,
  portals = ["parent", "staff"],
  submitClassName,
}: {
  next?: string;
  notice?: string;
  /** Các mục có trên trang này: /login = phụ huynh + giáo viên; /admin/login = chỉ quản trị */
  portals?: readonly LoginPortal[];
  /** Màu nút đăng nhập theo trang (vd. trang giáo viên dùng tông xanh dương) */
  submitClassName?: string;
  /** Từ URL (?as=, hoặc ?next=/teacher...) — ưu tiên hơn lựa chọn đã nhớ */
  initialPortal?: LoginPortal;
}) {
  const [state, formAction, pending] = useActionState(login, INITIAL_STATE);
  // Controlled: giữ nguyên giá trị đã nhập khi server trả lỗi (React 19 tự reset form không controlled)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [portal, setPortal] = useState<LoginPortal>(initialPortal ?? portals[0] ?? "parent");

  // Nhớ mục đã chọn lần trước trên thiết bị này (giáo viên không phải bấm lại mỗi lần)
  useEffect(() => {
    if (initialPortal || portals.length < 2) return;
    try {
      const saved = localStorage.getItem(PORTAL_KEY);
      const match = portals.find((p) => p === saved);
      if (match) setPortal(match);
    } catch {
      // localStorage bị chặn
    }
  }, [initialPortal, portals]);

  function choosePortal(value: LoginPortal) {
    setPortal(value);
    try {
      localStorage.setItem(PORTAL_KEY, value);
    } catch {
      // bỏ qua
    }
  }

  const looksLikePhone = /^[+\d]/.test(identifier.trim());
  const IdentifierIcon = looksLikePhone ? Phone : Mail;
  const showNotice = state === INITIAL_STATE && notice;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="portal" value={portal} />

      {portals.length > 1 && (
        <div className="space-y-2">
          <div role="radiogroup" aria-label="Loại tài khoản" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {portals.map((key) => {
              const { label, icon: Icon } = PORTALS[key];
              const active = portal === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choosePortal(key)}
                  disabled={pending}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all",
                    active ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">{PORTALS[portal].hint}</p>
        </div>
      )}

      {state.error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-2">
            <p>{state.error}</p>
            {state.suggestPortal &&
              state.suggestPortal !== portal &&
              (portals.includes(state.suggestPortal) ? (
                <button
                  type="button"
                  onClick={() => choosePortal(state.suggestPortal ?? "parent")}
                  className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
                >
                  <ArrowRightLeft className="size-3.5" /> Chuyển sang mục “{PORTALS[state.suggestPortal].label}”
                </button>
              ) : (
                <Link href={portalHref(state.suggestPortal)} className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2">
                  <ArrowRightLeft className="size-3.5" />
                  Đến trang đăng nhập {PORTALS[state.suggestPortal].label}
                </Link>
              ))}
          </div>
        </div>
      )}
      {showNotice && (
        <div role="status" className="flex gap-2 rounded-lg border bg-accent p-3 text-sm text-accent-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="identifier">Email hoặc số điện thoại</Label>
        <div className="relative">
          <IdentifierIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="identifier"
            name="identifier"
            type="text"
            inputMode={looksLikePhone ? "tel" : "email"}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={pending}
            aria-invalid={!!state.fieldErrors?.identifier}
            aria-describedby={state.fieldErrors?.identifier ? "identifier-error" : undefined}
            className={cn("h-11 pl-10", state.fieldErrors?.identifier && "border-destructive")}
          />
        </div>
        {state.fieldErrors?.identifier && (
          <p id="identifier-error" className="text-sm text-destructive">
            {state.fieldErrors.identifier}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
            className={cn("h-11 px-10", state.fieldErrors?.password && "border-destructive")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {state.fieldErrors?.password && (
          <p id="password-error" className="text-sm text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className={cn("h-11 w-full text-base", submitClassName)} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Đang đăng nhập..." : `Đăng nhập ${PORTALS[portal].label.toLowerCase()}`}
      </Button>
    </form>
  );
}
